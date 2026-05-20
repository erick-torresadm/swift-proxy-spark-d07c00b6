import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "@/lib/stripe.server";
import type Stripe from "stripe";

async function logAudit(action: string, status: string, payload: unknown, error?: string) {
  try {
    await supabaseAdmin.from("audit_log").insert({
      source: "stripe_webhook",
      action,
      status,
      request: payload as never,
      response: error ? ({ error } as never) : null,
    });
  } catch {
    /* ignore */
  }
}

async function markOrderPaid(opts: {
  orderId?: string | null;
  sessionId?: string | null;
  subscriptionId?: string | null;
  customerId?: string | null;
  currentPeriodEnd?: number | null;
  promoCode?: string | null;
  discountCents?: number | null;
}) {
  const updates: Record<string, unknown> = {
    status: "paid",
    last_payment_check_at: new Date().toISOString(),
  };
  if (opts.subscriptionId) updates.stripe_subscription_id = opts.subscriptionId;
  if (opts.customerId) updates.stripe_customer_id = opts.customerId;
  if (opts.currentPeriodEnd)
    updates.current_period_end = new Date(opts.currentPeriodEnd * 1000).toISOString();
  if (opts.promoCode) updates.promo_code = opts.promoCode;
  if (typeof opts.discountCents === "number") updates.discount_cents = opts.discountCents;
  updates.grace_until = null;

  let query = supabaseAdmin.from("orders").update(updates);
  if (opts.orderId) query = query.eq("id", opts.orderId);
  else if (opts.sessionId) query = query.eq("stripe_checkout_session_id", opts.sessionId);
  else if (opts.subscriptionId) query = query.eq("stripe_subscription_id", opts.subscriptionId);
  else return;
  await query;
}

async function markOrderPastDue(subscriptionId: string) {
  const graceUntil = new Date(Date.now() + 7 * 86400000).toISOString();
  await supabaseAdmin
    .from("orders")
    .update({ status: "past_due", grace_until: graceUntil })
    .eq("stripe_subscription_id", subscriptionId);
}

async function markOrderCanceled(subscriptionId: string) {
  await supabaseAdmin
    .from("orders")
    .update({ status: "canceled" })
    .eq("stripe_subscription_id", subscriptionId);
}

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sig = request.headers.get("stripe-signature");
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!sig || !secret) {
          return new Response("missing signature", { status: 400 });
        }
        const body = await request.text();
        const stripe = getStripe();

        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(body, sig, secret);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await logAudit("constructEvent", "error", { sig }, msg);
          return new Response(`invalid signature: ${msg}`, { status: 400 });
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const s = event.data.object as Stripe.Checkout.Session;
              const orderId = (s.metadata?.order_id as string | undefined) ?? s.client_reference_id ?? undefined;
              const subscriptionId =
                typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
              const customerId =
                typeof s.customer === "string" ? s.customer : s.customer?.id;
              const discountCents = s.total_details?.amount_discount ?? 0;
              // try to fetch first applied promotion code
              let promoCode: string | null = null;
              if (s.id) {
                try {
                  const expanded = await stripe.checkout.sessions.retrieve(s.id, {
                    expand: ["total_details.breakdown.discounts.discount.promotion_code"],
                  });
                  const disc = expanded.total_details?.breakdown?.discounts?.[0]
                    ?.discount as Stripe.Discount | undefined;
                  const pc = disc?.promotion_code;
                  if (pc && typeof pc !== "string") promoCode = pc.code ?? null;
                } catch {
                  /* ignore */
                }
              }
              await markOrderPaid({
                orderId,
                sessionId: s.id,
                subscriptionId,
                customerId,
                promoCode,
                discountCents,
              });
              break;
            }
            case "invoice.paid":
            case "invoice.payment_succeeded": {
              const inv = event.data.object as Stripe.Invoice;
              const subscriptionId =
                typeof (inv as unknown as { subscription?: string | { id: string } }).subscription === "string"
                  ? ((inv as unknown as { subscription: string }).subscription)
                  : ((inv as unknown as { subscription?: { id: string } }).subscription?.id ?? null);
              const customerId =
                typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;
              const periodEnd =
                (inv.lines?.data?.[0] as unknown as { period?: { end?: number } } | undefined)?.period?.end ?? null;
              await markOrderPaid({
                subscriptionId,
                customerId,
                currentPeriodEnd: periodEnd,
                discountCents: inv.total_discount_amounts?.reduce((s, d) => s + (d.amount ?? 0), 0) ?? 0,
              });
              break;
            }
            case "invoice.payment_failed": {
              const inv = event.data.object as Stripe.Invoice;
              const subscriptionId =
                typeof (inv as unknown as { subscription?: string | { id: string } }).subscription === "string"
                  ? ((inv as unknown as { subscription: string }).subscription)
                  : ((inv as unknown as { subscription?: { id: string } }).subscription?.id ?? null);
              if (subscriptionId) await markOrderPastDue(subscriptionId);
              break;
            }
            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              await markOrderCanceled(sub.id);
              break;
            }
            default:
              break;
          }
          await logAudit(event.type, "ok", { id: event.id });
          return new Response("ok");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await logAudit(event.type, "error", { id: event.id }, msg);
          return new Response(`handler error: ${msg}`, { status: 500 });
        }
      },
    },
  },
});
