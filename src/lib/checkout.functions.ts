import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { getStripe } from "./stripe.server";

const CheckoutSchema = z.object({
  productSlug: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(500),
  billing: z.enum(["monthly", "yearly"]),
  email: z.string().trim().toLowerCase().email().max(255),
  name: z.string().trim().min(1).max(120),
  couponCode: z.string().trim().min(1).max(40).optional().nullable(),
});

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
  const host = getRequestHost();
  return `https://${host}`;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CheckoutSchema.parse(data))
  .handler(async ({ data }) => {
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

    const stripe = getStripe();

    // Try to find existing auth user by email (link order if exists)
    let existingUserId: string | null = null;
    try {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      existingUserId =
        list.users.find((u) => u.email?.toLowerCase() === data.email)?.id ?? null;
    } catch {
      /* ignore */
    }

    // Reuse / create Stripe customer
    let customerId: string | undefined;
    const found = await stripe.customers.list({ email: data.email, limit: 1 });
    if (found.data[0]) {
      customerId = found.data[0].id;
    } else {
      const created = await stripe.customers.create({
        email: data.email,
        name: data.name,
      });
      customerId = created.id;
    }

    const totalAmount = unitAmount * data.quantity;

    // ---- Coupon resolution (server-side validation) ----
    let appliedCoupon: {
      coupon_id: string;
      code: string;
      discount_cents: number;
      stripe_coupon_id?: string;
    } | null = null;
    if (data.couponCode) {
      const { data: vc, error: vcErr } = await supabaseAdmin.rpc("validate_coupon" as never, {
        _code: data.couponCode,
        _amount_cents: totalAmount,
        _billing: data.billing,
      } as never);
      if (vcErr) throw new Error(vcErr.message);
      const v = vc as {
        valid: boolean;
        reason?: string;
        coupon_id?: string;
        code?: string;
        kind?: "percent" | "fixed";
        value_pct?: number | null;
        value_cents?: number | null;
        discount_cents?: number;
      };
      if (!v.valid) throw new Error(v.reason || "Cupom inválido");

      // Create/reuse a Stripe coupon ad-hoc
      const stripeCoupon = await stripe.coupons.create(
        v.kind === "percent"
          ? { percent_off: Number(v.value_pct), duration: "once", name: v.code }
          : { amount_off: Number(v.value_cents), currency: "brl", duration: "once", name: v.code },
      );
      appliedCoupon = {
        coupon_id: v.coupon_id!,
        code: v.code!,
        discount_cents: v.discount_cents ?? 0,
        stripe_coupon_id: stripeCoupon.id,
      };
    }

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: existingUserId,
        customer_email: data.email,
        customer_name: data.name,
        product_id: product.id,
        quantity: data.quantity,
        billing_cycle: data.billing,
        amount_cents: totalAmount,
        discount_cents: appliedCoupon?.discount_cents ?? 0,
        promo_code: appliedCoupon?.code ?? null,
        status: "pending",
        stripe_customer_id: customerId,
      })
      .select("id")
      .single();
    if (orderErr || !order)
      throw new Error(orderErr?.message || "Falha ao criar pedido");


    const origin = originFromRequest();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      // Stripe rejects allow_promotion_codes when discounts[] is set
      ...(appliedCoupon
        ? { discounts: [{ coupon: appliedCoupon.stripe_coupon_id! }] }
        : { allow_promotion_codes: true }),
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
              name: product.name,
              description: product.description ?? undefined,
              metadata: { product_slug: product.slug, product_id: product.id },
            },
          },
        },
      ],
      subscription_data: {
        metadata: {
          order_id: order.id,
          product_id: product.id,
          product_slug: product.slug,
          billing: data.billing,
          quantity: String(data.quantity),
          customer_email: data.email,
          customer_name: data.name,
          coupon_code: appliedCoupon?.code ?? "",
        },
      },
      metadata: {
        order_id: order.id,
        product_id: product.id,
        product_slug: product.slug,
        billing: data.billing,
        quantity: String(data.quantity),
        customer_email: data.email,
        customer_name: data.name,
        coupon_code: appliedCoupon?.code ?? "",
      },
      success_url: `${origin}/checkout/success?order=${order.id}`,
      cancel_url: `${origin}/checkout?plan=${product.slug}&billing=${data.billing}&qty=${data.quantity}&canceled=1`,
    });

    await supabaseAdmin
      .from("orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", order.id);

    // Best-effort: log redemption + increment uses_count (kept simple; webhook
    // may also record on paid status. We dedupe by order_id.)
    if (appliedCoupon) {
      await supabaseAdmin
        .from("coupon_redemptions" as never)
        .insert({
          coupon_id: appliedCoupon.coupon_id,
          order_id: order.id,
          user_id: existingUserId,
          customer_email: data.email,
          amount_cents_before: totalAmount,
          discount_cents: appliedCoupon.discount_cents,
        } as never);
      await supabaseAdmin.rpc("increment_coupon_uses" as never, {
        _coupon_id: appliedCoupon.coupon_id,
      } as never);
    }

    return { url: session.url, sessionId: session.id, orderId: order.id };
  });

