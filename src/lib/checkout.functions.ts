import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "./stripe.server";

const CheckoutSchema = z.object({
  productSlug: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(500),
  billing: z.enum(["monthly", "yearly"]),
});

function originFromRequest(): string {
  // Try Origin/Referer first (preserves correct protocol+port in dev)
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
  const host = getRequestHost();
  return `https://${host}`;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CheckoutSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: product, error: prodErr } = await supabaseAdmin
      .from("products")
      .select(
        "id, name, slug, description, price_monthly_cents, price_yearly_cents, block_size, active",
      )
      .eq("slug", data.productSlug)
      .eq("active", true)
      .maybeSingle();

    if (prodErr) throw new Error(prodErr.message);
    if (!product) throw new Error("Produto não encontrado");

    const unitAmount =
      data.billing === "yearly"
        ? product.price_yearly_cents
        : product.price_monthly_cents;
    if (!unitAmount || unitAmount <= 0)
      throw new Error("Plano sem preço configurado para este ciclo");

    const { data: userRow } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = userRow.user?.email;

    const stripe = getStripe();

    // Reuse existing Stripe customer for this email (if any)
    let customerId: string | undefined;
    if (email) {
      const found = await stripe.customers.list({ email, limit: 1 });
      customerId = found.data[0]?.id;
    }

    // Pre-create the order in "pending"; webhook will flip to paid
    const totalAmount = unitAmount * data.quantity;
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        product_id: product.id,
        quantity: data.quantity,
        billing_cycle: data.billing,
        amount_cents: totalAmount,
        status: "pending",
      })
      .select("id")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message || "Falha ao criar pedido");

    const origin = originFromRequest();
    const intervalLabel = data.billing === "yearly" ? "/ano" : "/mês";
    const productLabel =
      product.block_size > 1
        ? `${product.name} (bloco de ${product.block_size} IPs)`
        : product.name;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      customer_email: customerId ? undefined : email,
      allow_promotion_codes: true,
      client_reference_id: order.id,
      line_items: [
        {
          quantity: data.quantity,
          price_data: {
            currency: "brl",
            unit_amount: unitAmount,
            recurring: {
              interval: data.billing === "yearly" ? "year" : "month",
            },
            product_data: {
              name: productLabel,
              description: product.description ?? undefined,
              metadata: { product_slug: product.slug, product_id: product.id },
            },
          },
        },
      ],
      subscription_data: {
        metadata: {
          order_id: order.id,
          user_id: userId,
          product_id: product.id,
          product_slug: product.slug,
          billing: data.billing,
          quantity: String(data.quantity),
        },
      },
      metadata: {
        order_id: order.id,
        user_id: userId,
        product_id: product.id,
        product_slug: product.slug,
        billing: data.billing,
        quantity: String(data.quantity),
      },
      success_url: `${origin}/dashboard/orders?checkout=success&order=${order.id}`,
      cancel_url: `${origin}/checkout?plan=${product.slug}&billing=${data.billing}&qty=${data.quantity}&canceled=1`,
    });

    await supabaseAdmin
      .from("orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", order.id);

    return { url: session.url, sessionId: session.id, orderId: order.id };
  });
