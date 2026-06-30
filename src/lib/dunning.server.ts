/**
 * Dunning + Win-back engine.
 * Roda 1x/dia. Para cada pedido elegível, escolhe o estágio adequado
 * e envia o email — mas só se ainda não enviou o mesmo estágio antes.
 */
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { sendEmail, tplOverdue, tplWinback, type OverdueStage, type WinbackStage } from "./email.server";

const WINBACK_COUPON = "VOLTA20";
const WINBACK_PCT = 20;

interface OrderRow {
  id: string;
  user_id: string | null;
  product_id: string;
  status: string;
  amount_cents: number;
  current_period_end: string | null;
  updated_at: string;
  customer_email: string | null;
  customer_name: string | null;
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function pickOverdueStage(days: number): OverdueStage | null {
  if (days >= 15) return "d15";
  if (days >= 5) return "d5";
  if (days >= 1) return "d1";
  return null;
}

function pickWinbackStage(days: number): WinbackStage | null {
  if (days >= 45) return "d45";
  if (days >= 20) return "d20";
  if (days >= 7) return "d7";
  return null;
}

async function alreadySent(orderId: string, campaign: string, stage: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("dunning_emails")
    .select("id")
    .eq("order_id", orderId)
    .eq("campaign", campaign)
    .eq("stage", stage)
    .maybeSingle();
  return Boolean(data);
}

async function logSent(opts: {
  orderId: string;
  userId: string;
  campaign: string;
  stage: string;
  email: string;
  queueId?: string;
}) {
  await supabaseAdmin.from("dunning_emails").insert({
    order_id: opts.orderId,
    user_id: opts.userId,
    campaign: opts.campaign,
    stage: opts.stage,
    email: opts.email,
    queue_id: opts.queueId ?? null,
    resend_id: null,
  });
}

async function resolveRecipient(order: OrderRow): Promise<{ email: string; name?: string } | null> {
  if (order.customer_email) {
    return { email: order.customer_email, name: order.customer_name ?? undefined };
  }
  if (!order.user_id) return null;
  const { data: u } = await supabaseAdmin.auth.admin.getUserById(order.user_id);
  if (!u.user?.email) return null;
  const { data: p } = await supabaseAdmin
    .from("profiles").select("full_name").eq("user_id", order.user_id).maybeSingle();
  return { email: u.user.email, name: p?.full_name ?? undefined };
}

async function productName(productId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("products").select("name").eq("id", productId).maybeSingle();
  return data?.name ?? "Plano";
}

export interface DunningResult {
  scanned: number;
  overdueSent: number;
  winbackSent: number;
  skipped: number;
  errors: Array<{ orderId: string; error: string }>;
}

export async function runDunningSweep(opts: { dryRun?: boolean } = {}): Promise<DunningResult> {
  const result: DunningResult = { scanned: 0, overdueSent: 0, winbackSent: 0, skipped: 0, errors: [] };

  // ---- INADIMPLENTES (past_due / grace) ----
  const { data: overdueOrders } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, product_id, status, amount_cents, current_period_end, updated_at, customer_email, customer_name")
    .in("status", ["past_due", "grace"])
    .limit(500);

  for (const o of (overdueOrders ?? []) as OrderRow[]) {
    result.scanned++;
    try {
      const days = daysSince(o.current_period_end ?? o.updated_at);
      const stage = pickOverdueStage(days);
      if (!stage) { result.skipped++; continue; }
      if (await alreadySent(o.id, "overdue", stage)) { result.skipped++; continue; }
      const r = await resolveRecipient(o);
      if (!r) { result.skipped++; continue; }
      const name = await productName(o.product_id);
      if (opts.dryRun) {
        result.overdueSent++;
        continue;
      }
      const html = tplOverdue({
        customerName: r.name,
        productName: name,
        amountBRL: (o.amount_cents / 100).toFixed(2).replace(".", ","),
        daysOverdue: days,
        stage,
      });
      const subjects: Record<OverdueStage, string> = {
        d1: `Pagamento pendente · ${name}`,
        d5: `⚠️ Sua assinatura ${name} está em risco`,
        d15: `🚨 Último aviso: sua conta será cancelada`,
      };
      const send = await sendEmail({
        to: r.email,
        subject: subjects[stage],
        html,
        tags: [
          { name: "kind", value: "overdue" },
          { name: "stage", value: stage },
          { name: "order_id", value: o.id },
        ],
      });
      if (send.ok && o.user_id) {
        await logSent({ orderId: o.id, userId: o.user_id, campaign: "overdue", stage, email: r.email, resendId: send.id });
        result.overdueSent++;
      } else if (!send.ok) {
        result.errors.push({ orderId: o.id, error: send.error ?? "send failed" });
      }
    } catch (e) {
      result.errors.push({ orderId: o.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // ---- CANCELADOS (win-back) ----
  const { data: cancelled } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, product_id, status, amount_cents, current_period_end, updated_at, customer_email, customer_name")
    .in("status", ["cancelled", "expired"])
    .gte("updated_at", new Date(Date.now() - 60 * 86_400_000).toISOString())
    .limit(500);

  // Dedupe por user_id — só uma campanha de win-back por usuário ao mesmo tempo
  const seenUsers = new Set<string>();
  for (const o of (cancelled ?? []) as OrderRow[]) {
    result.scanned++;
    try {
      if (!o.user_id) { result.skipped++; continue; }
      if (seenUsers.has(o.user_id)) { result.skipped++; continue; }

      // Não envia win-back se o usuário tem outro pedido ativo/pago
      const { data: activeOther } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("user_id", o.user_id)
        .in("status", ["paid"])
        .limit(1);
      if (activeOther && activeOther.length > 0) { result.skipped++; continue; }

      const days = daysSince(o.updated_at);
      const stage = pickWinbackStage(days);
      if (!stage) { result.skipped++; continue; }
      if (await alreadySent(o.id, "winback", stage)) { result.skipped++; continue; }
      const r = await resolveRecipient(o);
      if (!r) { result.skipped++; continue; }
      const name = await productName(o.product_id);
      seenUsers.add(o.user_id);
      if (opts.dryRun) {
        result.winbackSent++;
        continue;
      }
      const html = tplWinback({
        customerName: r.name,
        productName: name,
        couponCode: WINBACK_COUPON,
        couponPct: WINBACK_PCT,
        stage,
        daysSinceCancel: days,
      });
      const subjects: Record<WinbackStage, string> = {
        d7: `💙 Sentimos sua falta — ${WINBACK_PCT}% off pra você voltar`,
        d20: `⏰ Seu cupom de ${WINBACK_PCT}% off está acabando`,
        d45: `🎁 Última oferta: ${WINBACK_PCT}% off no Fast Proxy`,
      };
      const send = await sendEmail({
        to: r.email,
        subject: subjects[stage],
        html,
        tags: [
          { name: "kind", value: "winback" },
          { name: "stage", value: stage },
          { name: "order_id", value: o.id },
        ],
      });
      if (send.ok) {
        await logSent({ orderId: o.id, userId: o.user_id, campaign: "winback", stage, email: r.email, resendId: send.id });
        result.winbackSent++;
      } else {
        result.errors.push({ orderId: o.id, error: send.error ?? "send failed" });
      }
    } catch (e) {
      result.errors.push({ orderId: o.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return result;
}
