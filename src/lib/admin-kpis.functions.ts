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
  const total = amount * (intervalCount || 1);
  switch (interval) {
    case "day":
      return Math.round(total * 30);
    case "week":
      return Math.round(total * 4.345);
    case "month":
      return Math.round(total / (intervalCount || 1)) * (intervalCount || 1) / (intervalCount || 1);
    case "year":
      return Math.round(total / 12);
    default:
      return total;
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

  // Subscriptions: ativas, trial, past_due, unpaid
  let activeSubs = 0;
  let trialingSubs = 0;
  let mrrCents = 0;
  for await (const sub of stripe.subscriptions.list({ status: "active", limit: 100, expand: ["data.items.data.price"] })) {
    activeSubs++;
    for (const item of sub.items.data) {
      const price = item.price;
      if (!price.recurring || !price.unit_amount) continue;
      mrrCents += priceToMonthlyCents(
        price.unit_amount * (item.quantity ?? 1),
        price.recurring.interval,
        price.recurring.interval_count ?? 1,
      );
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
    mrr_cents: mrrCents,
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
