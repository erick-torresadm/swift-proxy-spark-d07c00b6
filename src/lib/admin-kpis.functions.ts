import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/supabase-custom/auth-middleware";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { getStripe } from "./stripe.server";
import { sendEmail } from "./email.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("forbidden");
}




// Normaliza um price recorrente para valor mensal em centavos.
function priceToMonthlyCents(amount: number, interval: string, intervalCount: number): number {
  const n = intervalCount || 1;
  switch (interval) {
    case "day":
      return Math.round((amount / n) * 30);
    case "week":
      return Math.round((amount / n) * 4.345);
    case "month":
      return Math.round(amount / n);
    case "year":
      return Math.round(amount / (12 * n));
    default:
      return amount;
  }
}


async function collectStripeMetrics() {
  const stripe = getStripe();
  const since = Math.floor((Date.now() - 30 * 86400000) / 1000);

  // Customers — usamos a contagem aproximada via search/listing (cap 1000 p/ não estourar).
  let customersCount = 0;
  for await (const _ of stripe.customers.list({ limit: 100 })) {
    customersCount++;
    if (customersCount >= 1000) break;
  }

  // Subscriptions: ativas, trial, past_due, unpaid, canceled
  let activeSubs = 0;
  let trialingSubs = 0;
  let mrrCents = 0;
  const mrrByProduct = new Map<string, { name: string; mrr_cents: number; subs: number }>();
  const productNameCache = new Map<string, string>();
  const resolveProductName = async (productId: string): Promise<string> => {
    const cached = productNameCache.get(productId);
    if (cached) return cached;
    try {
      const p = await stripe.products.retrieve(productId);
      const name = p.name || productId;
      productNameCache.set(productId, name);
      return name;
    } catch {
      productNameCache.set(productId, productId);
      return productId;
    }
  };
  for await (const sub of stripe.subscriptions.list({
    status: "active",
    limit: 100,
    expand: ["data.items.data.price"],
  })) {
    activeSubs++;
    for (const item of sub.items.data) {
      const price = item.price;
      if (!price.recurring || !price.unit_amount) continue;
      const monthly = priceToMonthlyCents(
        price.unit_amount * (item.quantity ?? 1),
        price.recurring.interval,
        price.recurring.interval_count ?? 1,
      );
      mrrCents += monthly;
      const product = price.product;
      const prodId = typeof product === "string" ? product : product?.id ?? "unknown";
      const prodName = prodId === "unknown" ? prodId : await resolveProductName(prodId);
      const existing = mrrByProduct.get(prodId) ?? { name: prodName, mrr_cents: 0, subs: 0 };
      existing.mrr_cents += monthly;
      existing.subs += 1;
      mrrByProduct.set(prodId, existing);
    }
  }

  for await (const _ of stripe.subscriptions.list({ status: "trialing", limit: 100 })) {
    trialingSubs++;
  }
  let delinquentSubs = 0;
  for await (const _ of stripe.subscriptions.list({ status: "past_due", limit: 100 })) {
    delinquentSubs++;
  }
  for await (const _ of stripe.subscriptions.list({ status: "unpaid", limit: 100 })) {
    delinquentSubs++;
  }
  let canceledSubs = 0;
  for await (const _ of stripe.subscriptions.list({ status: "canceled", limit: 100 })) {
    canceledSubs++;
    if (canceledSubs >= 500) break;
  }

  // Receita 30d via charges (succeeded - refunded).
  let revenue30dCents = 0;
  let payments30d = 0;
  for await (const ch of stripe.charges.list({ created: { gte: since }, limit: 100 })) {
    if (ch.status !== "succeeded") continue;
    payments30d++;
    revenue30dCents += (ch.amount ?? 0) - (ch.amount_refunded ?? 0);
  }

  return {
    customers: customersCount,
    active_subs: activeSubs,
    trialing_subs: trialingSubs,
    delinquent_subs: delinquentSubs,
    canceled_subs: canceledSubs,
    mrr_cents: mrrCents,
    mrr_by_product: Array.from(mrrByProduct.entries())
      .map(([id, v]) => ({ product_id: id, name: v.name, mrr_cents: v.mrr_cents, subs: v.subs }))
      .sort((a, b) => b.mrr_cents - a.mrr_cents),
    revenue30d_cents: revenue30dCents,
    payments30d,
  };
}


export const getAdminKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);



    let stripe: Awaited<ReturnType<typeof collectStripeMetrics>> | null = null;
    let stripeError: string | null = null;
    try {
      stripe = await collectStripeMetrics();
    } catch (e) {
      stripeError = e instanceof Error ? e.message : "Stripe falhou";
    }

    const [
      { count: localCustomers },
      { count: activeProxies },
      { count: stockAvailable },
      { count: stockAllocated },
      { count: dbPastDue },
      { data: lowStock },
    ] = await Promise.all([
      supabaseAdmin.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "customer"),
      supabaseAdmin.from("customer_proxies").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabaseAdmin.from("proxy_stock").select("*", { count: "exact", head: true }).eq("status", "available"),
      supabaseAdmin.from("proxy_stock").select("*", { count: "exact", head: true }).eq("status", "allocated"),
      supabaseAdmin.from("orders").select("*", { count: "exact", head: true }).in("status", ["past_due", "grace"]),
      supabaseAdmin.from("restock_rules").select("min_stock, product_id").eq("enabled", true),
    ]);

    let alerts = 0;
    for (const rule of lowStock ?? []) {
      const { count } = await supabaseAdmin
        .from("proxy_stock")
        .select("*", { count: "exact", head: true })
        .eq("product_id", rule.product_id)
        .eq("status", "available");
      if ((count ?? 0) < rule.min_stock) alerts++;
    }

    const result = {
      stripe,
      stripe_error: stripeError,
      local_customers: localCustomers ?? 0,
      active_proxies: activeProxies ?? 0,
      stock_available: stockAvailable ?? 0,
      stock_allocated: stockAllocated ?? 0,
      stock_alerts: alerts,
      db_past_due: dbPastDue ?? 0,
      generated_at: new Date().toISOString(),
    };
    return result;
  });


// ============== Inadimplentes ==============

export interface DelinquentRow {
  user_id: string | null;
  order_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  amount_cents: number;
  billing_cycle: string | null;
  status: string;
  days_overdue: number;
  grace_until: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  source: "db" | "stripe";
}

export const listDelinquents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    // 1) Pedidos no banco em past_due/grace
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select(
        "id, user_id, amount_cents, billing_cycle, status, grace_until, current_period_end, stripe_customer_id, stripe_subscription_id, customer_email, created_at",
      )
      .in("status", ["past_due", "grace"])
      .order("created_at", { ascending: false })
      .limit(200);

    const userIds = Array.from(new Set((orders ?? []).map((o) => o.user_id).filter(Boolean) as string[]));
    const profilesMap = new Map<string, { full_name: string | null; phone: string | null }>();
    if (userIds.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, full_name, phone")
        .in("user_id", userIds);
      for (const p of profiles ?? []) {
        profilesMap.set(p.user_id, { full_name: p.full_name, phone: p.phone });
      }
    }

    // Emails via auth admin (paralelo, individual)
    const emailMap = new Map<string, string | null>();
    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
          emailMap.set(uid, data.user?.email ?? null);
        } catch {
          emailMap.set(uid, null);
        }
      }),
    );

    const now = Date.now();
    const rows: DelinquentRow[] = (orders ?? []).map((o) => {
      const refDate = o.grace_until ?? o.current_period_end;
      const days = refDate ? Math.max(0, Math.floor((now - new Date(refDate).getTime()) / 86400000)) : 0;
      const prof = o.user_id ? profilesMap.get(o.user_id) : null;
      return {
        user_id: o.user_id,
        order_id: o.id,
        full_name: prof?.full_name ?? null,
        email: (o.user_id ? emailMap.get(o.user_id) : null) ?? o.customer_email ?? null,
        phone: prof?.phone ?? null,
        amount_cents: o.amount_cents ?? 0,
        billing_cycle: o.billing_cycle,
        status: o.status,
        days_overdue: days,
        grace_until: o.grace_until,
        current_period_end: o.current_period_end,
        stripe_customer_id: o.stripe_customer_id,
        stripe_subscription_id: o.stripe_subscription_id,
        source: "db" as const,
      };
    });

    return { rows, total: rows.length };
  });

// ============== Dunning email (cobrança) ==============

export const sendDunningEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid().optional(),
        userId: z.string().uuid().optional(),
        toEmailOverride: z.string().email().optional(),
        customMessage: z.string().max(2000).optional(),
      })
      .refine((d) => d.orderId || d.userId || d.toEmailOverride, {
        message: "Informe orderId, userId ou email",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    let email = data.toEmailOverride ?? null;
    let fullName: string | null = null;
    let stripeCustomerId: string | null = null;
    let amountCents = 0;
    let cycle: string | null = null;

    if (data.orderId) {
      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("user_id, amount_cents, billing_cycle, customer_email, stripe_customer_id")
        .eq("id", data.orderId)
        .maybeSingle();
      if (order) {
        amountCents = order.amount_cents ?? 0;
        cycle = order.billing_cycle ?? null;
        stripeCustomerId = order.stripe_customer_id ?? null;
        if (!email && order.customer_email) email = order.customer_email;
        if (order.user_id) {
          const { data: p } = await supabaseAdmin
            .from("profiles")
            .select("full_name")
            .eq("user_id", order.user_id)
            .maybeSingle();
          fullName = p?.full_name ?? null;
          if (!email) {
            const { data: u } = await supabaseAdmin.auth.admin.getUserById(order.user_id);
            email = u.user?.email ?? null;
          }
        }
      }
    } else if (data.userId) {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("user_id", data.userId)
        .maybeSingle();
      fullName = p?.full_name ?? null;
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.userId);
      if (!email) email = u.user?.email ?? null;
    }

    if (!email) throw new Error("Sem email do destinatário");

    // Tenta gerar link do portal Stripe pra autoatendimento
    let portalUrl: string | null = null;
    if (stripeCustomerId) {
      try {
        const stripe = getStripe();
        const origin = process.env.SITE_URL ?? "https://fastproxy.com.br";
        const sess = await stripe.billingPortal.sessions.create({
          customer: stripeCustomerId,
          return_url: `${origin}/dashboard/orders`,
        });
        portalUrl = sess.url;
      } catch {
        portalUrl = null;
      }
    }

    const amountStr = (amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const greeting = fullName ? `Olá ${fullName.split(" ")[0]}` : "Olá";
    const body =
      data.customMessage ??
      `Identificamos que sua assinatura FastProxy está com pagamento pendente${
        cycle ? ` (ciclo ${cycle})` : ""
      }${amountCents ? `, no valor de ${amountStr}` : ""}. Para evitar a suspensão do serviço, regularize o quanto antes.`;

    const cta = portalUrl
      ? `<p style="margin:24px 0"><a href="${portalUrl}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">Regularizar pagamento</a></p>`
      : `<p style="margin:24px 0"><a href="https://fastproxy.com.br/dashboard/orders" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">Acessar minha conta</a></p>`;

    const html = `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0">
  <h2 style="margin:0 0 12px 0">Pagamento pendente</h2>
  <p>${greeting},</p>
  <p>${body.replace(/\n/g, "<br/>")}</p>
  ${cta}
  <p style="font-size:12px;color:#64748b;margin-top:24px">Se já efetuou o pagamento, ignore este aviso.<br/>Equipe FastProxy</p>
</div></body></html>`;

    const r = await sendEmail({
      to: email,
      subject: "Pagamento pendente · FastProxy",
      html,
      tags: [
        { name: "kind", value: "dunning" },
        ...(data.orderId ? [{ name: "order", value: data.orderId.slice(0, 16) }] : []),
      ],
    });
    if (!r.ok) throw new Error(r.error ?? "Falha ao enviar");
    return { ok: true, id: r.id, sent_to: email, portal_url: portalUrl };
  });

// ============== Cancelados (winback) ==============

export interface CanceledRow {
  subscription_id: string;
  customer_id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  user_id: string | null;
  amount_cents: number;
  interval: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  product_name: string | null;
  days_since_cancel: number;
}

export const listCanceled = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const stripe = getStripe();
    const rows: CanceledRow[] = [];
    let count = 0;

    for await (const sub of stripe.subscriptions.list({
      status: "canceled",
      limit: 100,
      expand: ["data.items.data.price.product", "data.customer"],
    })) {
      count++;
      if (count > 200) break;

      const customer = sub.customer;
      const customerId = typeof customer === "string" ? customer : customer.id;
      const email =
        typeof customer === "object" && customer && !("deleted" in customer)
          ? customer.email ?? null
          : null;
      const name =
        typeof customer === "object" && customer && !("deleted" in customer)
          ? customer.name ?? null
          : null;
      const phone =
        typeof customer === "object" && customer && !("deleted" in customer)
          ? customer.phone ?? null
          : null;

      const item = sub.items.data[0];
      const price = item?.price;
      const product = price?.product;
      const productName =
        typeof product === "object" && product && "name" in product
          ? (product.name as string)
          : null;
      const amount = price?.unit_amount ?? 0;
      const interval = price?.recurring?.interval ?? null;
      const canceledAt = sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null;
      const days = sub.canceled_at
        ? Math.floor((Date.now() - sub.canceled_at * 1000) / 86400000)
        : 0;
      const reason =
        sub.cancellation_details?.reason ??
        sub.cancellation_details?.feedback ??
        null;

      // tenta achar user_id local + phone via email
      let userId: string | null = null;
      let localPhone: string | null = null;
      if (email) {
        try {
          const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
          const u = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
          if (u) {
            userId = u.id;
            const { data: p } = await supabaseAdmin
              .from("profiles")
              .select("phone")
              .eq("user_id", u.id)
              .maybeSingle();
            localPhone = p?.phone ?? null;
          }
        } catch {
          /* ignore */
        }
      }

      rows.push({
        subscription_id: sub.id,
        customer_id: customerId,
        email,
        name,
        phone: phone ?? localPhone,
        user_id: userId,
        amount_cents: amount,
        interval,
        canceled_at: canceledAt,
        cancel_reason: typeof reason === "string" ? reason : null,
        product_name: productName,
        days_since_cancel: days,
      });
    }

    return { rows, total: rows.length };
  });

export const sendWinbackEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        name: z.string().nullable().optional(),
        productName: z.string().nullable().optional(),
        couponCode: z.string().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const greeting = data.name ? `Olá ${data.name.split(" ")[0]}` : "Olá";
    const product = data.productName ? ` no plano <strong>${data.productName}</strong>` : "";
    const promo = data.couponCode
      ? `<p>Use o cupom <strong style="background:#fef3c7;padding:2px 6px;border-radius:4px">${data.couponCode}</strong> ao reativar para um desconto especial.</p>`
      : "";

    const html = `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0">
  <h2 style="margin:0 0 12px 0">Sentimos sua falta na FastProxy 👋</h2>
  <p>${greeting},</p>
  <p>Notamos que sua assinatura${product} foi cancelada. Estamos sempre melhorando nossa rede de proxies — mais países, mais estabilidade e suporte mais rápido.</p>
  ${promo}
  <p style="margin:24px 0">
    <a href="https://fastproxy.com.br/precos" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">
      Reativar assinatura
    </a>
  </p>
  <p>Se cancelou por algum problema, responda este email — adoraríamos resolver.</p>
  <p style="font-size:12px;color:#64748b;margin-top:24px">Equipe FastProxy</p>
</div></body></html>`;

    const r = await sendEmail({
      to: data.email,
      subject: "Volte para a FastProxy — temos novidades para você",
      html,
      tags: [{ name: "kind", value: "winback" }],
    });
    if (!r.ok) throw new Error(r.error ?? "Falha ao enviar");
    return { ok: true, id: r.id, sent_to: data.email };
  });
