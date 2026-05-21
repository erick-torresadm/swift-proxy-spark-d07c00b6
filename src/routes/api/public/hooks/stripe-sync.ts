import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { getStripe } from "@/lib/stripe.server";

/**
 * Cron-triggered job. For every order with a Stripe subscription, syncs the
 * status back to our DB:
 *  - active           → status='paid', clears grace_until
 *  - past_due/unpaid  → status='past_due', sets grace_until = now + 7 days (if not set)
 *  - canceled         → status='cancelled'
 * Then calls release_expired_grace_proxies() to free proxies whose grace ended.
 */
export const Route = createFileRoute("/api/public/hooks/stripe-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Authenticate via Supabase anon key in apikey header
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const stripe = getStripe();
        const summary = {
          checked: 0,
          updated: 0,
          released: 0,
          errors: [] as string[],
        };

        // Pull active-ish orders that have a Stripe subscription attached
        const { data: orders, error } = await supabaseAdmin
          .from("orders")
          .select("id, status, stripe_subscription_id, grace_until")
          .not("stripe_subscription_id", "is", null)
          .in("status", ["paid", "past_due", "grace", "pending"]);

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        for (const o of orders ?? []) {
          summary.checked++;
          try {
            const sub = await stripe.subscriptions.retrieve(
              o.stripe_subscription_id as string,
            );

            let newStatus: string = o.status as string;
            let graceUntil: string | null = o.grace_until;
            const periodEnd = new Date(
              (sub as any).current_period_end * 1000,
            ).toISOString();

            if (sub.status === "active" || sub.status === "trialing") {
              newStatus = "paid";
              graceUntil = null;
            } else if (
              sub.status === "past_due" ||
              sub.status === "unpaid" ||
              sub.status === "incomplete"
            ) {
              newStatus = "past_due";
              if (!graceUntil) {
                graceUntil = new Date(
                  Date.now() + 7 * 86400 * 1000,
                ).toISOString();
              }
            } else if (
              sub.status === "canceled" ||
              sub.status === "incomplete_expired"
            ) {
              newStatus = "cancelled";
            }

            if (newStatus !== o.status || graceUntil !== o.grace_until) {
              await supabaseAdmin
                .from("orders")
                .update({
                  status: newStatus as never,
                  grace_until: graceUntil,
                  current_period_end: periodEnd,
                  last_payment_check_at: new Date().toISOString(),
                })
                .eq("id", o.id);
              summary.updated++;
            } else {
              await supabaseAdmin
                .from("orders")
                .update({ last_payment_check_at: new Date().toISOString() })
                .eq("id", o.id);
            }
          } catch (e) {
            summary.errors.push(
              `${o.id}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }

        // Release proxies whose grace expired
        const { data: rel } = await supabaseAdmin.rpc(
          "release_expired_grace_proxies",
        );
        summary.released = (rel as any)?.[0]?.released_count ?? 0;

        await supabaseAdmin.from("audit_log").insert({
          action: "stripe.sync",
          source: "cron",
          status: "ok",
          response: summary as never,
        });

        return Response.json({ ok: true, ...summary });
      },
    },
  },
});
