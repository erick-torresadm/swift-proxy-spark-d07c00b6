import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/supabase-custom/auth-middleware";

/**
 * Prépago packages (mode=payment): sold as (product, quantity, term_months) tuples.
 * Reduces churn — no auto-renew, cliente prepaga múltiplos IPs por N meses.
 * Fixos (ipv6-br) já têm preços; rotativos (ipv6-fb-br) foram semeados como
 * estrutura sem preço/inativos para o admin definir depois.
 */

export type PublicPackage = {
  id: string;
  product_id: string;
  product_slug: string;
  product_name: string;
  category: string | null;
  country_code: string | null;
  quantity: number;
  term_months: number;
  price_cents: number;
  label: string | null;
  description: string | null;
  sort_order: number;
};

export type ProductPackageGroup = {
  product_id: string;
  product_slug: string;
  product_name: string;
  product_description: string | null;
  category: string | null;
  country_code: string | null;
  price_monthly_cents: number;
  price_yearly_cents: number | null;
  packages: PublicPackage[];
};

export const listPackagesPublic = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProductPackageGroup[]> => {
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    const { data, error } = await supabaseAdmin
      .from("product_packages")
      .select(
        `
        id, product_id, quantity, term_months, price_cents, label, description, sort_order,
        products!inner (
          id, slug, name, description, category, country_code, active,
          price_monthly_cents, price_yearly_cents
        )
      `,
      )
      .eq("active", true)
      .not("price_cents", "is", null)
      .order("sort_order", { ascending: true });

    if (error) throw new Error(error.message);

    const groups = new Map<string, ProductPackageGroup>();
    for (const row of (data ?? []) as never[]) {
      const r = row as {
        id: string;
        product_id: string;
        quantity: number;
        term_months: number;
        price_cents: number;
        label: string | null;
        description: string | null;
        sort_order: number;
        products: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          category: string | null;
          country_code: string | null;
          active: boolean;
          price_monthly_cents: number;
          price_yearly_cents: number | null;
        };
      };
      if (!r.products?.active) continue;
      const pid = r.products.id;
      if (!groups.has(pid)) {
        groups.set(pid, {
          product_id: pid,
          product_slug: r.products.slug,
          product_name: r.products.name,
          product_description: r.products.description,
          category: r.products.category,
          country_code: r.products.country_code,
          price_monthly_cents: r.products.price_monthly_cents,
          price_yearly_cents: r.products.price_yearly_cents,
          packages: [],
        });
      }
      groups.get(pid)!.packages.push({
        id: r.id,
        product_id: pid,
        product_slug: r.products.slug,
        product_name: r.products.name,
        category: r.products.category,
        country_code: r.products.country_code,
        quantity: r.quantity,
        term_months: r.term_months,
        price_cents: r.price_cents,
        label: r.label,
        description: r.description,
        sort_order: r.sort_order,
      });
    }
    return Array.from(groups.values());
  },
);

// ─────────────────────── Admin CRUD ───────────────────────

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export type AdminPackageRow = {
  id: string;
  product_id: string;
  product_slug: string;
  product_name: string;
  quantity: number;
  term_months: number;
  price_cents: number | null;
  label: string | null;
  description: string | null;
  active: boolean;
  sort_order: number;
};

export const listAdminPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminPackageRow[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    const { data, error } = await supabaseAdmin
      .from("product_packages")
      .select(
        "id, product_id, quantity, term_months, price_cents, label, description, active, sort_order, products!inner(slug, name)",
      )
      .order("product_id", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as never[]).map((row) => {
      const r = row as {
        id: string;
        product_id: string;
        quantity: number;
        term_months: number;
        price_cents: number | null;
        label: string | null;
        description: string | null;
        active: boolean;
        sort_order: number;
        products: { slug: string; name: string };
      };
      return {
        id: r.id,
        product_id: r.product_id,
        product_slug: r.products.slug,
        product_name: r.products.name,
        quantity: r.quantity,
        term_months: r.term_months,
        price_cents: r.price_cents,
        label: r.label,
        description: r.description,
        active: r.active,
        sort_order: r.sort_order,
      };
    });
  });

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid(),
  quantity: z.number().int().positive().max(1000),
  term_months: z.number().int().positive().max(60),
  price_cents: z.number().int().positive().max(100_000_000).nullable(),
  label: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  active: z.boolean(),
  sort_order: z.number().int().min(0).max(9999),
});

export const upsertPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    const payload = {
      product_id: data.product_id,
      quantity: data.quantity,
      term_months: data.term_months,
      price_cents: data.price_cents,
      label: data.label ?? null,
      description: data.description ?? null,
      active: data.active,
      sort_order: data.sort_order,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("product_packages")
        .update(payload as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("product_packages")
      .insert(payload as never)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, id: (inserted as { id?: string } | null)?.id ?? null };
  });

export const deletePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    const { error } = await supabaseAdmin
      .from("product_packages")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const togglePackageActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; active: boolean }) => ({
    id: z.string().uuid().parse(d.id),
    active: z.boolean().parse(d.active),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    const { error } = await supabaseAdmin
      .from("product_packages")
      .update({ active: data.active } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listVpsProductOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    const { data } = await supabaseAdmin
      .from("products")
      .select("id, slug, name, category, country_code, active")
      .order("slug", { ascending: true });
    return (data ?? []).map((r) => ({
      id: r.id as string,
      slug: (r.slug as string) ?? null,
      name: (r.name as string) ?? null,
      category: (r.category as string) ?? null,
      country_code: (r.country_code as string) ?? null,
      active: !!r.active,
    }));
  });

// ─────────────────────── Checkout (mode=payment) ───────────────────────

const CheckoutPackageSchema = z.object({
  packageId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(255),
  name: z.string().trim().min(1).max(120),
  whatsapp: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().min(10).max(15)),
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

export const createPackageCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CheckoutPackageSchema.parse(d))
  .handler(async ({ data }) => {
    const { enforceRateLimit, currentIp } = await import("@/lib/rate-limit.server");
    await enforceRateLimit("checkout.package", currentIp(), 60, 30);

    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    const { getStripe } = await import("@/lib/stripe.server");

    const { data: pkg, error: pkgErr } = await supabaseAdmin
      .from("product_packages")
      .select(
        "id, product_id, quantity, term_months, price_cents, label, active, products!inner(id, slug, name, description, active)",
      )
      .eq("id", data.packageId)
      .eq("active", true)
      .maybeSingle();
    if (pkgErr) throw new Error(pkgErr.message);
    if (!pkg) throw new Error("Pacote não encontrado");
    const raw = pkg as unknown as {
      id: string;
      product_id: string;
      quantity: number;
      term_months: number;
      price_cents: number | null;
      label: string | null;
      active: boolean;
      products: {
        id: string;
        slug: string;
        name: string;
        description: string | null;
        active: boolean;
      };
    };
    if (!raw.price_cents || raw.price_cents <= 0) {
      throw new Error("Pacote sem preço configurado");
    }
    if (!raw.products.active) throw new Error("Produto inativo");

    const stripe = getStripe();

    // Reuse Stripe customer by email
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
      const created = await stripe.customers.create({ email: data.email, name: data.name, phone: phoneE164 });
      customerId = created.id;
    }

    // Attach existing user by email if any
    let existingUserId: string | null = null;
    try {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      existingUserId = list.users.find((u) => u.email?.toLowerCase() === data.email)?.id ?? null;
    } catch {
      /* ignore */
    }

    // Coupon validation (server-side)
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
          _amount_cents: raw.price_cents,
          _billing: "yearly", // pacotes prépagos contam como ciclo "yearly" para regras de cupom
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

    // Provisional current_period_end: paid_at + term_months (30d cada)
    const nowMs = Date.now();
    const periodEnd = new Date(nowMs + raw.term_months * 30 * 86400_000).toISOString();

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: existingUserId,
        customer_email: data.email,
        customer_name: data.name,
        customer_phone: phoneE164,
        product_id: raw.product_id,
        package_id: raw.id,
        quantity: raw.quantity,
        billing_cycle: raw.term_months >= 12 ? "yearly" : "monthly",
        amount_cents: raw.price_cents,
        discount_cents: appliedCoupon?.discount_cents ?? 0,
        promo_code: appliedCoupon?.code ?? null,
        status: "pending",
        stripe_customer_id: customerId,
        current_period_end: periodEnd,
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
    const label =
      raw.label ??
      `${raw.products.name} · ${raw.quantity} IP${raw.quantity > 1 ? "s" : ""} · ${raw.term_months} ${raw.term_months === 1 ? "mês" : "meses"}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      ...(appliedCoupon
        ? { discounts: [{ coupon: appliedCoupon.stripe_coupon_id! }] }
        : { allow_promotion_codes: true }),
      client_reference_id: order.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "brl",
            unit_amount: raw.price_cents,
            product_data: {
              name: label,
              description: raw.products.description ?? undefined,
              metadata: {
                product_slug: raw.products.slug,
                product_id: raw.products.id,
                package_id: raw.id,
                quantity: String(raw.quantity),
                term_months: String(raw.term_months),
              },
            },
          },
        },
      ],
      payment_intent_data: {
        metadata: {
          order_id: order.id,
          product_id: raw.products.id,
          product_slug: raw.products.slug,
          package_id: raw.id,
          quantity: String(raw.quantity),
          term_months: String(raw.term_months),
          customer_email: data.email,
          customer_name: data.name,
          coupon_code: appliedCoupon?.code ?? "",
        },
      },
      metadata: {
        order_id: order.id,
        product_id: raw.products.id,
        product_slug: raw.products.slug,
        package_id: raw.id,
        quantity: String(raw.quantity),
        term_months: String(raw.term_months),
        customer_email: data.email,
        customer_name: data.name,
        coupon_code: appliedCoupon?.code ?? "",
        checkout_kind: "package",
      },
      success_url: `${origin}/checkout/success?order=${order.id}`,
      cancel_url: `${origin}/pacotes?canceled=1`,
    });

    await supabaseAdmin
      .from("orders")
      .update({ stripe_checkout_session_id: session.id } as never)
      .eq("id", order.id);

    if (appliedCoupon) {
      await supabaseAdmin.from("coupon_redemptions" as never).insert({
        coupon_id: appliedCoupon.coupon_id,
        order_id: order.id,
        user_id: existingUserId,
        customer_email: data.email,
        amount_cents_before: raw.price_cents,
        discount_cents: appliedCoupon.discount_cents,
      } as never);
      await supabaseAdmin.rpc(
        "increment_coupon_uses" as never,
        { _coupon_id: appliedCoupon.coupon_id } as never,
      );
    }

    return { url: session.url, sessionId: session.id, orderId: order.id };
  });
