import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { getStripe } from "@/lib/stripe.server";
import { checkCronAuth } from "@/lib/cron-auth.server";
import { allocateProxiesForOrder, hideOrReleaseProxiesForOrder, restoreHiddenProxiesForPaidOrder } from "@/lib/allocation.server";
import { reconcileOrderWithStripe } from "@/lib/reconcile.server";

function subscriptionPeriodEnd(subscription: unknown): string | null {
  const sub = subscription as {
    current_period_end?: number | null;
    items?: { data?: Array<{ current_period_end?: number | null }> };
  };
  const ts = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

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
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;

        const stripe = getStripe();
        const summary = {
          checked: 0,
          updated: 0,
          reconciled: 0,
          allocated: 0,
          released: 0,
          errors: [] as string[],
        };

        // First, recover paid checkout sessions when the webhook was delayed/misconfigured.
        const { data: pendingSessions } = await supabaseAdmin
          .from("orders")
          .select("id")
          .eq("status", "pending")
          .not("stripe_checkout_session_id", "is", null)
          .order("created_at", { ascending: true })
          .limit(50);

        for (const p of pendingSessions ?? []) {
          summary.checked++;
          try {
            const r = await reconcileOrderWithStripe(p.id);
            if (r.changed) summary.reconciled++;
            summary.allocated += r.allocated;
            if (r.status === "pending" && r.reason?.includes("payment_status=unpaid")) {
              const { data: order } = await supabaseAdmin
                .from("orders")
                .select("stripe_checkout_session_id")
                .eq("id", p.id)
                .maybeSingle();
              if (order?.stripe_checkout_session_id) {
                const session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
                if (session.status === "expired") {
                  await supabaseAdmin.from("orders").update({ status: "expired" }).eq("id", p.id).eq("status", "pending");
                  summary.updated++;
                }
              }
            }
          } catch (e) {
            summary.errors.push(`${p.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        // Pull active-ish orders that have a Stripe subscription attached.
        const { data: orders, error } = await supabaseAdmin
          .from("orders")
          .select("id, status, stripe_subscription_id, grace_until, current_period_end")
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
            const periodEnd = subscriptionPeriodEnd(sub);

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

            const currentPeriodEnd = o.current_period_end ? new Date(o.current_period_end).toISOString() : null;
            if (newStatus !== o.status || graceUntil !== o.grace_until || (periodEnd && periodEnd !== currentPeriodEnd)) {
              const updates: Record<string, unknown> = {
                status: newStatus,
                grace_until: graceUntil,
                last_payment_check_at: new Date().toISOString(),
              };
              if (periodEnd) updates.current_period_end = periodEnd;
              await supabaseAdmin
                .from("orders")
                .update(updates as never)
                .eq("id", o.id);
              summary.updated++;
            } else {
              await supabaseAdmin
                .from("orders")
                .update({ last_payment_check_at: new Date().toISOString() })
                .eq("id", o.id);
            }

            if (newStatus === "paid") {
              await restoreHiddenProxiesForPaidOrder(o.id);
              const r = await allocateProxiesForOrder(o.id);
              summary.allocated += r.allocated;
              if (r.error) summary.errors.push(`${o.id}: allocation ${r.error}`);
            } else if (newStatus === "past_due") {
              await supabaseAdmin
                .from("customer_proxies")
                .update({ status: "grace" as never })
                .eq("order_id", o.id)
                .eq("status", "active");
            } else if (newStatus === "cancelled") {
              const changed = await hideOrReleaseProxiesForOrder(o.id);
              summary.released += changed.hidden_ipv6 + changed.released;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.includes("similar object exists in test mode")) {
              summary.errors.push(`${o.id}: ${msg}`);
            }
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
