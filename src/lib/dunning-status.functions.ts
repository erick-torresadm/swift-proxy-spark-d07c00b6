// Status agregado dos emails de cobrança / winback + envios em massa.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/supabase-custom/auth-middleware";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import {
  sendEmail,
  tplOverdue,
  tplWinback,
  type OverdueStage,
  type WinbackStage,
} from "./email.server";

const WINBACK_COUPON_DEFAULT = "VOLTA20";
const WINBACK_PCT_DEFAULT = 20;

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r) => r.role === "admin")) throw new Error("Acesso negado");
}

// Status resumido por linha
export interface EmailStatus {
  campaign: "overdue" | "winback" | null;
  stage: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  error: string | null;
  trigger: "auto" | "manual" | null;
  converted_at: string | null;
  total_sent: number;
}

function summarize(rows: Array<{
  campaign: string; stage: string; sent_at: string; delivered_at: string | null;
  opened_at: string | null; clicked_at: string | null; bounced_at: string | null;
  error_message: string | null; trigger: string | null; converted_at: string | null;
}>): EmailStatus {
  if (rows.length === 0) {
    return { campaign: null, stage: null, sent_at: null, delivered_at: null, opened_at: null,
             clicked_at: null, bounced_at: null, error: null, trigger: null, converted_at: null, total_sent: 0 };
  }
  const sorted = rows.slice().sort((a, b) =>
    new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
  const latest = sorted[0];
  return {
    campaign: latest.campaign as "overdue" | "winback",
    stage: latest.stage,
    sent_at: latest.sent_at,
    delivered_at: latest.delivered_at,
    opened_at: rows.find((r) => r.opened_at)?.opened_at ?? null,
    clicked_at: rows.find((r) => r.clicked_at)?.clicked_at ?? null,
    bounced_at: latest.bounced_at,
    error: latest.error_message,
    trigger: (latest.trigger as "auto" | "manual" | null) ?? "auto",
    converted_at: rows.find((r) => r.converted_at)?.converted_at ?? null,
    total_sent: rows.length,
  };
}

// ---------- Status por order_id (inadimplentes) ----------
export const getDunningStatusByOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    orderIds: z.array(z.string().uuid()).max(500),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.orderIds.length === 0) return { map: {} as Record<string, EmailStatus> };

    const { data: rows } = await supabaseAdmin
      .from("dunning_emails")
      .select("order_id, campaign, stage, sent_at, delivered_at, opened_at, clicked_at, bounced_at, error_message, trigger, converted_at")
      .eq("campaign", "overdue")
      .in("order_id", data.orderIds);

    const grouped = new Map<string, typeof rows>();
    for (const r of rows ?? []) {
      const k = r.order_id;
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k)!.push(r);
    }

    const map: Record<string, EmailStatus> = {};
    for (const oid of data.orderIds) map[oid] = summarize(grouped.get(oid) ?? []);
    return { map };
  });

// ---------- Status por email (cancelados / winback) ----------
export const getWinbackStatusByEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    emails: z.array(z.string().email()).max(500),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.emails.length === 0) return { map: {} as Record<string, EmailStatus> };

    const lowered = data.emails.map((e) => e.toLowerCase());
    const { data: rows } = await supabaseAdmin
      .from("dunning_emails")
      .select("email, campaign, stage, sent_at, delivered_at, opened_at, clicked_at, bounced_at, error_message, trigger, converted_at")
      .eq("campaign", "winback")
      .in("email", lowered);

    const grouped = new Map<string, typeof rows>();
    for (const r of rows ?? []) {
      const k = (r.email ?? "").toLowerCase();
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k)!.push(r);
    }

    const map: Record<string, EmailStatus> = {};
    for (const e of data.emails) map[e] = summarize(grouped.get(e.toLowerCase()) ?? []);
    return { map };
  });

// ---------- Helper interno: envia 1 email + loga ----------
async function sendOverdueOne(o: {
  orderId: string; userId: string | null; email: string; name: string | null;
  productName: string; amountCents: number; daysOverdue: number; stage: OverdueStage;
  trigger: "auto" | "manual";
}) {
  const html = tplOverdue({
    customerName: o.name ?? undefined,
    productName: o.productName,
    amountBRL: (o.amountCents / 100).toFixed(2).replace(".", ","),
    daysOverdue: o.daysOverdue,
    stage: o.stage,
  });
  const subjects: Record<OverdueStage, string> = {
    d1: `Pagamento pendente · ${o.productName}`,
    d5: `⚠️ Sua assinatura ${o.productName} está em risco`,
    d15: `🚨 Último aviso: sua conta será cancelada`,
  };
  const send = await sendEmail({
    to: o.email,
    subject: subjects[o.stage],
    html,
    tags: [
      { name: "kind", value: "overdue" },
      { name: "stage", value: o.stage },
      { name: "order_id", value: o.orderId },
      { name: "trigger", value: o.trigger },
    ],
  });
  // log (upsert por unique [order_id, campaign, stage])
  await supabaseAdmin.from("dunning_emails").upsert({
    order_id: o.orderId,
    user_id: o.userId ?? "00000000-0000-0000-0000-000000000000",
    campaign: "overdue",
    stage: o.stage,
    email: o.email.toLowerCase(),
    resend_id: send.id ?? null,
    sent_at: new Date().toISOString(),
    error_message: send.ok ? null : (send.error ?? "send failed"),
    trigger: o.trigger,
  }, { onConflict: "order_id,campaign,stage" });
  return send;
}

async function sendWinbackOne(o: {
  email: string; name: string | null; productName: string; userId: string | null;
  daysSinceCancel: number; stage: WinbackStage; couponCode: string; couponPct: number;
  trigger: "auto" | "manual"; orderId?: string;
}) {
  const html = tplWinback({
    customerName: o.name ?? undefined,
    productName: o.productName,
    couponCode: o.couponCode,
    couponPct: o.couponPct,
    stage: o.stage,
    daysSinceCancel: o.daysSinceCancel,
  });
  const subjects: Record<WinbackStage, string> = {
    d7: `💙 Sentimos sua falta — ${o.couponPct}% off pra você voltar`,
    d20: `⏰ Seu cupom de ${o.couponPct}% off está acabando`,
    d45: `🎁 Última oferta: ${o.couponPct}% off no Fast Proxy`,
  };
  const send = await sendEmail({
    to: o.email,
    subject: subjects[o.stage],
    html,
    tags: [
      { name: "kind", value: "winback" },
      { name: "stage", value: o.stage },
      { name: "trigger", value: o.trigger },
    ],
  });

  // log: precisa de um order_id (FK). Se não temos, busca o último pedido cancelado desse usuário.
  let orderId = o.orderId ?? null;
  if (!orderId && o.userId) {
    const { data: lastOrder } = await supabaseAdmin
      .from("orders").select("id")
      .eq("user_id", o.userId)
      .in("status", ["cancelled", "expired"])
      .order("updated_at", { ascending: false })
      .limit(1).maybeSingle();
    orderId = lastOrder?.id ?? null;
  }
  if (orderId) {
    await supabaseAdmin.from("dunning_emails").upsert({
      order_id: orderId,
      user_id: o.userId ?? "00000000-0000-0000-0000-000000000000",
      campaign: "winback",
      stage: o.stage,
      email: o.email.toLowerCase(),
      resend_id: send.id ?? null,
      sent_at: new Date().toISOString(),
      error_message: send.ok ? null : (send.error ?? "send failed"),
      trigger: o.trigger,
    }, { onConflict: "order_id,campaign,stage" });
  }
  return send;
}

// ---------- Bulk: enviar pra todos os inadimplentes ----------
export const sendDunningToAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    orderIds: z.array(z.string().uuid()).max(500),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const result = { sent: 0, failed: 0, skipped: 0, errors: [] as string[] };

    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, product_id, amount_cents, current_period_end, updated_at, customer_email, customer_name")
      .in("id", data.orderIds);

    for (const o of orders ?? []) {
      try {
        const refDate = o.current_period_end ?? o.updated_at;
        const days = refDate ? Math.max(1, Math.floor((Date.now() - new Date(refDate).getTime()) / 86_400_000)) : 1;
        const stage: OverdueStage = days >= 15 ? "d15" : days >= 5 ? "d5" : "d1";

        let email = o.customer_email ?? null;
        let name = o.customer_name ?? null;
        if ((!email || !name) && o.user_id) {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(o.user_id);
          email = email ?? u.user?.email ?? null;
          const { data: p } = await supabaseAdmin
            .from("profiles").select("full_name").eq("user_id", o.user_id).maybeSingle();
          name = name ?? p?.full_name ?? null;
        }
        if (!email) { result.skipped++; continue; }

        const { data: prod } = await supabaseAdmin
          .from("products").select("name").eq("id", o.product_id).maybeSingle();

        const send = await sendOverdueOne({
          orderId: o.id, userId: o.user_id, email, name,
          productName: prod?.name ?? "Plano",
          amountCents: o.amount_cents ?? 0,
          daysOverdue: days, stage, trigger: "manual",
        });
        if (send.ok) result.sent++; else { result.failed++; if (send.error) result.errors.push(send.error); }
      } catch (e) {
        result.failed++;
        result.errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    return result;
  });

// ---------- Bulk: enviar winback pra todos os cancelados listados ----------
export const sendWinbackToAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    recipients: z.array(z.object({
      email: z.string().email(),
      name: z.string().nullable().optional(),
      productName: z.string().nullable().optional(),
      daysSinceCancel: z.number().int().min(0).default(7),
    })).max(500),
    couponCode: z.string().max(40).optional(),
    couponPct: z.number().int().min(1).max(100).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const result = { sent: 0, failed: 0, skipped: 0, errors: [] as string[] };
    const code = (data.couponCode || WINBACK_COUPON_DEFAULT).toUpperCase();
    const pct = data.couponPct ?? WINBACK_PCT_DEFAULT;

    for (const r of data.recipients) {
      try {
        const days = r.daysSinceCancel;
        const stage: WinbackStage = days >= 45 ? "d45" : days >= 20 ? "d20" : "d7";

        // tenta achar user_id local
        let userId: string | null = null;
        try {
          const { data: u } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
          userId = u.users.find((x) => x.email?.toLowerCase() === r.email.toLowerCase())?.id ?? null;
        } catch { /* ignore */ }

        const send = await sendWinbackOne({
          email: r.email,
          name: r.name ?? null,
          productName: r.productName ?? "Plano",
          userId,
          daysSinceCancel: days,
          stage,
          couponCode: code,
          couponPct: pct,
          trigger: "manual",
        });
        if (send.ok) result.sent++; else { result.failed++; if (send.error) result.errors.push(send.error); }
      } catch (e) {
        result.failed++;
        result.errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    return result;
  });
