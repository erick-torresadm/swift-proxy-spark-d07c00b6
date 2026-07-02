import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { getStripe } from "./stripe.server";

/**
 * One-click upgrade from a fresh monthly subscription to the yearly plan.
 * Offers a bonus month (yearly with a coupon = 1 mês grátis on top of the
 * usual 2 meses grátis do plano anual).
 *
 * Rules:
 *  - order must be paid AND billing_cycle=monthly
 *  - order must be < 45 minutes old (post-purchase upsell window)
 *  - haven't taken the upsell yet
 *  - creates a new checkout session for the yearly plan, same product+quantity
 *  - the caller's Stripe customer is reused so the saved card is one-click
 */
const UpsellSchema = z.object({ orderId: z.string().uuid() });

function originFromRequest(): string {
  const origin = getRequestHeader("origin");
  if (origin) return origin;
  const referer = getRequestHeader("referer");
  if (referer) {
    try {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* ignore */
    }
  }
  return `https://${getRequestHost()}`;
}

export const createAnnualUpgradeSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UpsellSchema.parse(data))
  .handler(async ({ data }) => {
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select(
        "id, status, quantity, billing_cycle, customer_email, customer_name, stripe_customer_id, upsell_taken, created_at, products(id, slug, name, description, price_monthly_cents, price_yearly_cents, active)",
      )
      .eq("id", data.orderId)
      .maybeSingle();

    if (orderErr) throw new Error(orderErr.message);
    if (!order) throw new Error("Pedido não encontrado");
    if (order.status !== "paid") throw new Error("Pedido ainda não confirmado");
    if (order.billing_cycle !== "monthly")
      throw new Error("Este pedido não é mensal");
    if (order.upsell_taken) throw new Error("Upgrade já realizado");

    const ageMinutes =
      (Date.now() - new Date(order.created_at as unknown as string).getTime()) / 60000;
    if (ageMinutes > 45) throw new Error("Janela do upgrade expirada");

    const product = order.products as {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      price_monthly_cents: number;
      price_yearly_cents: number | null;
      active: boolean;
    } | null;
    if (!product || !product.active) throw new Error("Produto indisponível");
    const yearlyUnit =
      product.price_yearly_cents ?? Math.round(product.price_monthly_cents * 12 * 0.825);
    if (!yearlyUnit) throw new Error("Plano anual sem preço configurado");

    const stripe = getStripe();

    // Create the "1 mês grátis" coupon on the fly (~= 1/12 off, once)
    const bonusCoupon = await stripe.coupons.create({
      percent_off: Number((100 / 12).toFixed(2)),
      duration: "once",
      name: "UPGRADE1MES — bônus 1 mês grátis",
    });

    // Mark the offer as seen so we can measure take rate later.
    await supabaseAdmin
      .from("orders")
      .update({ upsell_offered_at: new Date().toISOString() } as never)
      .eq("id", order.id);

    const origin = originFromRequest();

    // Create a new pending order for the yearly upgrade, tied back to the original.
    const yearlyTotal = yearlyUnit * order.quantity;
    const { data: upsellOrder, error: upsellErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: null,
        customer_email: order.customer_email,
        customer_name: order.customer_name,
        product_id: product.id,
        quantity: order.quantity,
        billing_cycle: "yearly",
        amount_cents: yearlyTotal,
        discount_cents: Math.round(yearlyTotal / 12), // ~1 mês grátis
        promo_code: "UPGRADE1MES",
        status: "pending",
        stripe_customer_id: order.stripe_customer_id,
        bumps: { upsellFrom: order.id } as never,
      } as never)
      .select("id")
      .single();
    if (upsellErr || !upsellOrder)
      throw new Error(upsellErr?.message || "Falha ao criar upgrade");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: order.stripe_customer_id ?? undefined,
      discounts: [{ coupon: bonusCoupon.id }],
      client_reference_id: upsellOrder.id,
      line_items: [
        {
          quantity: order.quantity,
          price_data: {
            currency: "brl",
            unit_amount: yearlyUnit,
            recurring: { interval: "year" },
            product_data: {
              name: `${product.name} — Plano Anual (upgrade)`,
              description: product.description ?? undefined,
              metadata: { product_slug: product.slug, product_id: product.id },
            },
          },
        },
      ],
      subscription_data: {
        metadata: {
          order_id: upsellOrder.id,
          product_id: product.id,
          product_slug: product.slug,
          billing: "yearly",
          quantity: String(order.quantity),
          customer_email: order.customer_email ?? "",
          customer_name: order.customer_name ?? "",
          upsell_from: order.id,
          coupon_code: "UPGRADE1MES",
        },
      },
      metadata: {
        order_id: upsellOrder.id,
        product_id: product.id,
        product_slug: product.slug,
        billing: "yearly",
        quantity: String(order.quantity),
        upsell_from: order.id,
        coupon_code: "UPGRADE1MES",
      },
      success_url: `${origin}/checkout/success?order=${upsellOrder.id}&upsell=1`,
      cancel_url: `${origin}/checkout/success?order=${order.id}&upsell_canceled=1`,
    });

    await supabaseAdmin
      .from("orders")
      .update({
        stripe_checkout_session_id: session.id,
        upsell_order_id: upsellOrder.id,
      } as never)
      .eq("id", order.id);

    return { url: session.url, sessionId: session.id, upsellOrderId: upsellOrder.id };
  });
