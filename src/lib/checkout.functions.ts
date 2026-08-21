import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { getStripe } from "./stripe.server";
import { computeBumpsTotals, type Bumps } from "./order-bumps";
import { notifyAllAdmins } from "./notifications.server";

const BumpsSchema = z
  .object({
    extraProxies: z.number().int().min(0).max(50).optional(),
    extendMonths: z.number().int().min(0).max(24).optional(),
    vipSupport: z.boolean().optional(),
    setupAssist: z.boolean().optional(),
  })
  .optional()
  .nullable();

/** Ciclo de cobrança suportado em assinaturas. */
export const BILLING_CYCLES = ["monthly", "quarterly", "semiannual", "yearly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

const CheckoutSchema = z.object({
  productSlug: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(500),
  billing: z.enum(BILLING_CYCLES),
  email: z.string().trim().toLowerCase().email().max(255),
  name: z.string().trim().min(1).max(120),
  whatsapp: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().min(10).max(15)),
  couponCode: z.string().trim().min(1).max(40).optional().nullable(),
  bumps: BumpsSchema,
});

/** Meses cobertos por cada ciclo (para math de bumps/preview). */
export const BILLING_MONTHS: Record<BillingCycle, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

/** Rótulos PT-BR por ciclo (UI). */
export const BILLING_LABELS: Record<BillingCycle, { title: string; unit: string; months: number }> = {
  monthly: { title: "Mensal", unit: "mês", months: 1 },
  quarterly: { title: "Trimestral", unit: "trimestre", months: 3 },
  semiannual: { title: "Semestral", unit: "semestre", months: 6 },
  yearly: { title: "Anual", unit: "ano", months: 12 },
};

/** Intervalo + intervalo_count do Stripe para cada ciclo. */
export function billingToStripeRecurring(billing: BillingCycle): {
  interval: "month" | "year";
  interval_count?: number;
} {
  switch (billing) {
    case "yearly":
      return { interval: "year", interval_count: 1 };
    case "quarterly":
      return { interval: "month", interval_count: 3 };
    case "semiannual":
      return { interval: "month", interval_count: 6 };
    default:
      return { interval: "month", interval_count: 1 };
  }
}


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
    // Rate limit anti-abuso: até 30 checkouts/min por IP.
    const { enforceRateLimit, currentIp } = await import("@/lib/rate-limit.server");
    await enforceRateLimit("checkout.create", currentIp(), 60, 30);

    const { data: product, error: prodErr } = await supabaseAdmin
      .from("products")
      .select(
        "id, name, slug, description, price_monthly_cents, price_quarterly_cents, price_semiannual_cents, price_yearly_cents, block_size, active",
      )
      .eq("slug", data.productSlug)
      .eq("active", true)
      .maybeSingle();

    if (prodErr) throw new Error(prodErr.message);
    if (!product) throw new Error("Produto não encontrado");

    const priceByBilling: Record<BillingCycle, number | null | undefined> = {
      monthly: product.price_monthly_cents,
      quarterly: product.price_quarterly_cents,
      semiannual: product.price_semiannual_cents,
      yearly: product.price_yearly_cents,
    };
    const unitAmount = priceByBilling[data.billing] ?? null;
    if (!unitAmount || unitAmount <= 0)
      throw new Error("Plano sem preço configurado para este ciclo");

    // ---- Order bumps (server-side pricing = source of truth) ----
    const bumps: Bumps = data.bumps ?? {};
    // Monthly unit price is the reference for all bump math, even on yearly.
    const unitMonthlyCents = product.price_monthly_cents;
    const bumpTotals = computeBumpsTotals({
      billing: data.billing,
      unitMonthlyCents,
      quantity: data.quantity,
      bumps,
    });
    // Effective quantity = base + extra proxies (extra proxies bill recurring).
    const effectiveQuantity = data.quantity + bumpTotals.extraProxies;

    const stripe = getStripe();

    // Try to find existing auth user by email (link order if exists)
    let existingUserId: string | null = null;
    try {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      existingUserId = list.users.find((u) => u.email?.toLowerCase() === data.email)?.id ?? null;
    } catch {
      /* ignore */
    }

    // Reuse / create Stripe customer
    const phoneE164 = data.whatsapp.startsWith("55") || data.whatsapp.length > 11
      ? `+${data.whatsapp}`
      : `+55${data.whatsapp}`;
    let customerId: string | undefined;
    const found = await stripe.customers.list({ email: data.email, limit: 1 });
    if (found.data[0]) {
      customerId = found.data[0].id;
      try {
        await stripe.customers.update(customerId, { phone: phoneE164, name: data.name });
      } catch { /* ignore */ }
    } else {
      const created = await stripe.customers.create({
        email: data.email,
        name: data.name,
        phone: phoneE164,
      });
      customerId = created.id;
    }

    // Base subscription total (recurring). Bumps that hit the first invoice
    // are added on top; the recurring extras (extra proxies) are already in
    // effectiveQuantity.
    const totalAmount =
      unitAmount * effectiveQuantity + bumpTotals.firstInvoiceExtraCents;

    // ---- Coupon resolution (server-side validation) ----
    let appliedCoupon: {
      coupon_id: string;
      code: string;
      discount_cents: number;
      stripe_coupon_id?: string;
    } | null = null;
    if (data.couponCode) {
      const { data: vc, error: vcErr } = await supabaseAdmin.rpc(
        "validate_coupon" as never,
        {
          _code: data.couponCode,
          _amount_cents: totalAmount,
          _billing: data.billing,
        } as never,
      );
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
        customer_phone: phoneE164,
        product_id: product.id,
        quantity: effectiveQuantity,
        billing_cycle: data.billing,
        amount_cents: totalAmount,
        discount_cents: appliedCoupon?.discount_cents ?? 0,
        promo_code: appliedCoupon?.code ?? null,
        status: "pending",
        stripe_customer_id: customerId,
        bumps: bumps as never,
        vip_support: !!bumps.vipSupport,
      } as never)
      .select("id")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message || "Falha ao criar pedido");

    if (existingUserId) {
      await supabaseAdmin
        .from("profiles")
        .update({ phone: phoneE164 } as never)
        .eq("user_id", existingUserId);
    }

    const origin = originFromRequest();

    // Build one-time invoice items for bumps that shouldn't recur.
    const addInvoiceItems: Array<{
      quantity: number;
      price_data: { currency: string; unit_amount: number; product_data: { name: string } };
    }> = [];
    if (bumpTotals.extendMonthsCents > 0) {
      addInvoiceItems.push({
        quantity: 1,
        price_data: {
          currency: "brl",
          unit_amount: bumpTotals.extendMonthsCents,
          product_data: {
            name: `Pré-pagamento +${bumpTotals.extendMonths} meses (30% off)`,
          },
        },
      });
    }
    if (bumpTotals.vipSupportCents > 0) {
      addInvoiceItems.push({
        quantity: 1,
        price_data: {
          currency: "brl",
          unit_amount: bumpTotals.vipSupportCents,
          product_data: { name: "Suporte Prioritário VIP" },
        },
      });
    }
    if (bumpTotals.setupAssistCents > 0) {
      addInvoiceItems.push({
        quantity: 1,
        price_data: {
          currency: "brl",
          unit_amount: bumpTotals.setupAssistCents,
          product_data: { name: "Setup assistido 1:1" },
        },
      });
    }

    const bumpsMeta = JSON.stringify(bumps);

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
          quantity: effectiveQuantity,
          price_data: {
            currency: "brl",
            unit_amount: unitAmount,
            recurring: billingToStripeRecurring(data.billing),
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
          quantity: String(effectiveQuantity),
          customer_email: data.email,
          customer_name: data.name,
          coupon_code: appliedCoupon?.code ?? "",
          bumps: bumpsMeta,
        },
        ...(addInvoiceItems.length > 0 ? { add_invoice_items: addInvoiceItems } : {}),
      },
      metadata: {
        order_id: order.id,
        product_id: product.id,
        product_slug: product.slug,
        billing: data.billing,
        quantity: String(effectiveQuantity),
        customer_email: data.email,
        customer_name: data.name,
        coupon_code: appliedCoupon?.code ?? "",
        bumps: bumpsMeta,
      },
      success_url: `${origin}/checkout/success?order=${order.id}`,
      cancel_url: `${origin}/checkout?plan=${product.slug}&billing=${data.billing}&qty=${data.quantity}&canceled=1`,
    });

    await supabaseAdmin
      .from("orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", order.id);

    void notifyAllAdmins({
      title: "🛒 Checkout iniciado",
      body: `${product.name} × ${effectiveQuantity} — ${data.name} (${data.email})`,
      link: "/admin/orders",
      metadata: { orderId: order.id, productSlug: product.slug, email: data.email },
      dedupeKey: `checkout-created:${order.id}`,
    });


    // Best-effort: log redemption + increment uses_count (kept simple; webhook
    // may also record on paid status. We dedupe by order_id.)
    if (appliedCoupon) {
      await supabaseAdmin.from("coupon_redemptions" as never).insert({
        coupon_id: appliedCoupon.coupon_id,
        order_id: order.id,
        user_id: existingUserId,
        customer_email: data.email,
        amount_cents_before: totalAmount,
        discount_cents: appliedCoupon.discount_cents,
      } as never);
      await supabaseAdmin.rpc(
        "increment_coupon_uses" as never,
        {
          _coupon_id: appliedCoupon.coupon_id,
        } as never,
      );
    }

    return { url: session.url, sessionId: session.id, orderId: order.id };
  });
