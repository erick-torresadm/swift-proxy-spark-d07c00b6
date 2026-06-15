import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/supabase-custom/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
  const { data } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

function periodStart(period: "today" | "7d" | "30d"): Date {
  const now = new Date();
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const days = period === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 86400_000);
}

let kpiCache: { key: string; at: number; data: unknown } | null = null;

export const getStripeKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ period: z.enum(["today", "7d", "30d"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const cacheKey = data.period;
    if (kpiCache && kpiCache.key === cacheKey && Date.now() - kpiCache.at < 60_000) {
      return kpiCache.data as Awaited<ReturnType<typeof compute>>;
    }

    async function compute() {
      const { getStripe } = await import("@/lib/stripe.server");
      const stripe = getStripe();
      const start = periodStart(data.period);
      const startUnix = Math.floor(start.getTime() / 1000);

      const [balance, charges, refunds, subs, disputes] = await Promise.all([
        stripe.balance.retrieve().catch(() => null),
        stripe.charges.list({ created: { gte: startUnix }, limit: 100 }).catch(() => ({ data: [] as Stripe_Charge[] })),
        stripe.refunds.list({ created: { gte: startUnix }, limit: 100 }).catch(() => ({ data: [] as Stripe_Refund[] })),
        stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.items"] }).catch(() => ({ data: [] as Stripe_Subscription[] })),
        stripe.disputes.list({ created: { gte: startUnix }, limit: 50 }).catch(() => ({ data: [] as Stripe_Dispute[] })),
      ]);

      // Receita líquida (sucesso - reembolso)
      const grossCents = (charges.data ?? [])
        .filter((c) => c.status === "succeeded" && c.paid && !c.refunded)
        .reduce((s, c) => s + (c.amount ?? 0), 0);
      const refundedCents = (refunds.data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
      const netCents = Math.max(0, grossCents - refundedCents);

      const successCharges = (charges.data ?? []).filter((c) => c.status === "succeeded");
      const avgTicketCents = successCharges.length > 0 ? Math.round(grossCents / successCharges.length) : 0;

      // MRR
      let mrrCents = 0;
      let activeSubs = 0;
      let trialingSubs = 0;
      let pastDueSubs = 0;
      let canceledInPeriod = 0;
      for (const sub of subs.data ?? []) {
        if (sub.status === "active") activeSubs++;
        if (sub.status === "trialing") trialingSubs++;
        if (sub.status === "past_due" || sub.status === "unpaid") pastDueSubs++;
        const canceledAt = (sub as unknown as { canceled_at?: number | null }).canceled_at;
        if (canceledAt && canceledAt >= startUnix) canceledInPeriod++;

        if (sub.status === "active" || sub.status === "trialing") {
          for (const it of sub.items?.data ?? []) {
            const price = it.price;
            const unit = price?.unit_amount ?? 0;
            const qty = (it as unknown as { quantity?: number }).quantity ?? 1;
            const interval = price?.recurring?.interval;
            const count = price?.recurring?.interval_count ?? 1;
            let monthly = 0;
            if (interval === "month") monthly = (unit * qty) / count;
            else if (interval === "year") monthly = (unit * qty) / (12 * count);
            else if (interval === "week") monthly = (unit * qty * 4.345) / count;
            else if (interval === "day") monthly = (unit * qty * 30) / count;
            mrrCents += monthly;
          }
        }
      }
      mrrCents = Math.round(mrrCents);

      const churnPct = activeSubs + canceledInPeriod > 0
        ? Math.round((canceledInPeriod / (activeSubs + canceledInPeriod)) * 1000) / 10
        : 0;

      const openDisputes = (disputes.data ?? []).filter((d) => d.status !== "lost" && d.status !== "won");
      const disputeAmountCents = openDisputes.reduce((s, d) => s + (d.amount ?? 0), 0);

      const availableCents = (balance?.available ?? []).reduce((s, b) => s + (b.amount ?? 0), 0);
      const pendingCents = (balance?.pending ?? []).reduce((s, b) => s + (b.amount ?? 0), 0);
      const currency = (balance?.available?.[0]?.currency ?? balance?.pending?.[0]?.currency ?? "brl").toUpperCase();

      return {
        period: data.period,
        net_revenue_cents: netCents,
        gross_revenue_cents: grossCents,
        refunded_cents: refundedCents,
        refunds_count: (refunds.data ?? []).length,
        mrr_cents: mrrCents,
        active_subs: activeSubs,
        trialing_subs: trialingSubs,
        past_due_subs: pastDueSubs,
        canceled_in_period: canceledInPeriod,
        churn_pct: churnPct,
        avg_ticket_cents: avgTicketCents,
        success_charges: successCharges.length,
        open_disputes: openDisputes.length,
        dispute_amount_cents: disputeAmountCents,
        balance_available_cents: availableCents,
        balance_pending_cents: pendingCents,
        balance_currency: currency,
        generated_at: new Date().toISOString(),
      };
    }

    const result = await compute();
    kpiCache = { key: cacheKey, at: Date.now(), data: result };
    return result;
  });

export const listStripeEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().min(1).max(200).default(50), type: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");

    let q = supabaseAdmin
      .from("stripe_events")
      .select(
        "id, type, occurred_at, livemode, customer_email, customer_id, subscription_id, invoice_id, charge_id, payment_intent_id, session_id, order_id, amount_cents, currency, status, reason",
      )
      .order("occurred_at", { ascending: false })
      .limit(data.limit);

    if (data.type) q = q.eq("type", data.type);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const syncStripeBackfill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.number().min(1).max(90).default(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    const { getStripe } = await import("@/lib/stripe.server");
    const stripe = getStripe();

    const created = { gte: Math.floor((Date.now() - data.days * 86400_000) / 1000) };
    let imported = 0;
    let cursor: string | undefined;

    for (let page = 0; page < 20; page++) {
      const res = await stripe.events.list({ created, limit: 100, starting_after: cursor });
      for (const ev of res.data) {
        const obj = ev.data.object as unknown as Record<string, unknown>;
        const subscriptionId =
          (obj.subscription as string | undefined) ?? (ev.type.startsWith("customer.subscription") ? (obj.id as string) : null);
        const customerId = (obj.customer as string | undefined) ?? null;
        const amount =
          (obj.amount_total as number | undefined) ??
          (obj.amount_paid as number | undefined) ??
          (obj.amount as number | undefined) ??
          (obj.amount_refunded as number | undefined) ??
          null;
        await supabaseAdmin.from("stripe_events").upsert(
          {
            id: ev.id,
            type: ev.type,
            livemode: ev.livemode,
            occurred_at: new Date((ev.created ?? 0) * 1000).toISOString(),
            customer_id: customerId,
            customer_email: (obj.customer_email as string | undefined) ?? null,
            subscription_id: subscriptionId,
            invoice_id: ev.type.startsWith("invoice") ? (obj.id as string) : (obj.invoice as string | undefined) ?? null,
            charge_id: ev.type.startsWith("charge") ? (obj.id as string) : (obj.charge as string | undefined) ?? null,
            payment_intent_id: ev.type.startsWith("payment_intent") ? (obj.id as string) : (obj.payment_intent as string | undefined) ?? null,
            session_id: ev.type.startsWith("checkout.session") ? (obj.id as string) : null,
            amount_cents: typeof amount === "number" ? amount : null,
            currency: (obj.currency as string | undefined) ?? null,
            status: (obj.status as string | undefined) ?? (obj.payment_status as string | undefined) ?? null,
            raw: { type: ev.type, data: ev.data } as never,
          } as never,
          { onConflict: "id" },
        );
        imported++;
      }
      if (!res.has_more) break;
      cursor = res.data[res.data.length - 1]?.id;
      if (!cursor) break;
    }

    return { imported };
  });

/**
 * Lista assinaturas ativas / trialing / past_due no Stripe — pra cancelar do painel.
 * Inclui flag se já está agendada pra cancelar no fim do ciclo.
 */
export const listActiveStripeSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().min(1).max(100).default(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { getStripe } = await import("@/lib/stripe.server");
    const stripe = getStripe();

    const rows: Array<{
      id: string;
      status: string;
      customer_id: string | null;
      customer_email: string | null;
      amount_cents: number | null;
      currency: string | null;
      interval: string | null;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
      product_name: string | null;
      created: string;
    }> = [];

    for (const statusFilter of ["active", "trialing", "past_due"] as const) {
      const res = await stripe.subscriptions.list({
        status: statusFilter,
        limit: data.limit,
        expand: ["data.items.data.price.product", "data.customer"],
      });
      for (const sub of res.data) {
        const item = sub.items?.data?.[0];
        const price = item?.price as { unit_amount?: number | null; currency?: string; recurring?: { interval?: string } | null; product?: unknown } | undefined;
        const product = price?.product as { name?: string } | string | undefined;
        const customer = sub.customer as unknown as { id?: string; email?: string | null } | string;
        const pe = (sub as unknown as { current_period_end?: number }).current_period_end;
        rows.push({
          id: sub.id,
          status: sub.status,
          customer_id: typeof customer === "string" ? customer : customer?.id ?? null,
          customer_email: typeof customer === "string" ? null : customer?.email ?? null,
          amount_cents: typeof price?.unit_amount === "number" ? price.unit_amount * (item?.quantity ?? 1) : null,
          currency: price?.currency ?? null,
          interval: price?.recurring?.interval ?? null,
          current_period_end: pe ? new Date(pe * 1000).toISOString() : null,
          cancel_at_period_end: !!sub.cancel_at_period_end,
          product_name: typeof product === "object" && product ? product.name ?? null : null,
          created: new Date(sub.created * 1000).toISOString(),
        });
      }
    }

    rows.sort((a, b) => (a.current_period_end ?? "").localeCompare(b.current_period_end ?? ""));
    return rows;
  });

/**
 * Cancela uma assinatura Stripe NO FIM DO CICLO atual.
 * - Não reembolsa.
 * - Cliente mantém acesso até `current_period_end`.
 * - Quando o período vencer, o webhook `customer.subscription.deleted` libera os proxies.
 */
export const adminCancelSubscriptionAtPeriodEnd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        subscriptionId: z.string().min(3),
        reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { getStripe } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    const stripe = getStripe();

    const sub = await stripe.subscriptions.update(data.subscriptionId, {
      cancel_at_period_end: true,
      cancellation_details: {
        comment: data.reason ?? "Cancelado pelo admin (fim do ciclo)",
      },
    });

    const pe = (sub as unknown as { current_period_end?: number }).current_period_end;
    const periodEndIso = pe ? new Date(pe * 1000).toISOString() : null;

    // Reflete no pedido vinculado (não muda status — cliente ainda tem acesso)
    await supabaseAdmin
      .from("orders")
      .update({
        current_period_end: periodEndIso,
        last_payment_check_at: new Date().toISOString(),
      } as never)
      .eq("stripe_subscription_id", data.subscriptionId);

    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId,
      source: "admin",
      action: "stripe.subscription.cancel_at_period_end",
      status: "ok",
      request: { subscription_id: data.subscriptionId, reason: data.reason ?? null } as never,
      response: { period_end: periodEndIso } as never,
    } as never);


    return {
      ok: true as const,
      subscription_id: sub.id,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      current_period_end: periodEndIso,
    };
  });

/**
 * Reverte um cancelamento agendado (cliente / admin mudou de ideia antes do fim do ciclo).
 */
export const adminResumeSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ subscriptionId: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { getStripe } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    const stripe = getStripe();

    const sub = await stripe.subscriptions.update(data.subscriptionId, {
      cancel_at_period_end: false,
    });

    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: "stripe.subscription.resume",
      target: data.subscriptionId,
      details: {} as never,
    } as never);

    return { ok: true as const, subscription_id: sub.id, cancel_at_period_end: !!sub.cancel_at_period_end };
  });


// Minimal Stripe type aliases (to avoid pulling full types here)
type Stripe_Charge = { id: string; amount?: number; amount_refunded?: number; status?: string; paid?: boolean; refunded?: boolean; currency?: string };
type Stripe_Refund = { id: string; amount?: number; currency?: string };
type Stripe_Subscription = {
  id: string;
  status: string;
  items?: { data?: Array<{ price?: { unit_amount?: number | null; recurring?: { interval?: string; interval_count?: number } | null }; quantity?: number }> };
};
type Stripe_Dispute = { id: string; amount?: number; currency?: string; status?: string };
