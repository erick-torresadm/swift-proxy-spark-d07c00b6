/**
 * Dunning + Win-back engine.
 * Roda 1x/dia. Inadimplente recebe um email por dia (até 15 dias) com um
 * link de checkout com desconto; cancelado recebe win-back em 3 estágios.
 */
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { sendEmail, tplOverdue, tplWinback, type OverdueTone, type WinbackStage } from "./email.server";
import { getStripe } from "./stripe.server";

const WINBACK_COUPON = "VOLTA20";
const WINBACK_PCT = 20;
// O webhook/sync grava grace_until = falha + 7 dias; a data da falha é o que conta.
const GRACE_DAYS = 7;
// Um email por dia enquanto estiver inadimplente, até este limite. Depois disso
// a assinatura cai pelo fluxo normal do Stripe e paramos de cobrar por email —
// cobrança diária sem fim vira assédio (CDC art. 42) e queima o domínio.
const OVERDUE_MAX_DAYS = 15;
export const DUNNING_DISCOUNT_PCT = 20;
const SITE_URL = process.env.SITE_URL ?? "https://www.fastproxy.com.br";

interface OrderRow {
  id: string;
  user_id: string | null;
  product_id: string;
  status: string;
  amount_cents: number;
  current_period_end: string | null;
  grace_until: string | null;
  stripe_subscription_id: string | null;
  updated_at: string;
  customer_email: string | null;
  customer_name: string | null;
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// current_period_end não serve de âncora: o Stripe avança o período mesmo
// sem pagamento, então "dias em atraso" dava negativo e nunca disparava.
function overdueAnchor(o: OrderRow): string {
  if (o.grace_until) {
    return new Date(new Date(o.grace_until).getTime() - GRACE_DAYS * 86_400_000).toISOString();
  }
  return o.updated_at;
}

function overdueTone(days: number): OverdueTone {
  if (days >= 15) return "d15";
  if (days >= 5) return "d5";
  return "d1";
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

async function openInvoiceFor(subscriptionId: string): Promise<{ invoice: Stripe.Invoice; customerId: string } | null> {
  const sub = await getStripe().subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
  const inv = sub.latest_invoice;
  if (!inv || typeof inv === "string" || inv.status !== "open" || !inv.id) return null;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  return { invoice: inv, customerId };
}

/**
 * Fatura finalizada não aceita desconto no Stripe. Então geramos um checkout
 * avulso já com o desconto; quando pago, /api/public/dunning/settle marca a
 * fatura original como paga (out of band) e o sync reativa a assinatura.
 */
export async function createDunningSettleLink(opts: {
  orderId: string;
  subscriptionId: string;
  productName: string;
}): Promise<{ url: string; originalCents: number; discountedCents: number } | null> {
  const open = await openInvoiceFor(opts.subscriptionId);
  if (!open) return null;
  const originalCents = open.invoice.amount_due;
  const discountedCents = Math.round(originalCents * (1 - DUNNING_DISCOUNT_PCT / 100));
  if (discountedCents < 100) return null;

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    customer: open.customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "brl",
          unit_amount: discountedCents,
          product_data: {
            name: `Regularização · ${opts.productName} (${DUNNING_DISCOUNT_PCT}% off)`,
            description: `Quita a fatura ${open.invoice.number ?? open.invoice.id} em atraso`,
          },
        },
      },
    ],
    metadata: {
      kind: "dunning_settle",
      order_id: opts.orderId,
      invoice_id: open.invoice.id,
      subscription_id: opts.subscriptionId,
    },
    expires_at: Math.floor(Date.now() / 1000) + 24 * 3600,
    success_url: `${SITE_URL}/api/public/dunning/settle?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/dashboard/orders`,
  });
  if (!session.url) return null;
  return { url: session.url, originalCents, discountedCents };
}

/** Chamado pelo redirect de sucesso e pelo webhook. Idempotente. */
export async function settleDunningSession(sessionId: string): Promise<{ ok: boolean; reason?: string }> {
  const stripe = getStripe();
  const s = await stripe.checkout.sessions.retrieve(sessionId);
  if (s.metadata?.kind !== "dunning_settle") return { ok: false, reason: "not a dunning session" };
  if (s.payment_status !== "paid") return { ok: false, reason: `payment_status=${s.payment_status}` };
  const invoiceId = s.metadata.invoice_id;
  if (!invoiceId) return { ok: false, reason: "no invoice_id" };

  const inv = await stripe.invoices.retrieve(invoiceId);
  if (inv.status === "paid") return { ok: true };
  try {
    await stripe.invoices.pay(invoiceId, { paid_out_of_band: true });
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  if (s.metadata.order_id) {
    await supabaseAdmin.from("dunning_emails")
      .update({ converted_at: new Date().toISOString() })
      .eq("order_id", s.metadata.order_id)
      .is("converted_at", null);
  }
  return { ok: true };
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

  // ---- INADIMPLENTES (past_due / grace) — um email por dia ----
  const { data: overdueOrders } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, product_id, status, amount_cents, current_period_end, grace_until, stripe_subscription_id, updated_at, customer_email, customer_name")
    .in("status", ["past_due", "grace"])
    .limit(500);

  for (const o of (overdueOrders ?? []) as OrderRow[]) {
    result.scanned++;
    try {
      const days = daysSince(overdueAnchor(o));
      if (days < 1 || days > OVERDUE_MAX_DAYS) { result.skipped++; continue; }
      const stage = `day${days}`;
      if (await alreadySent(o.id, "overdue", stage)) { result.skipped++; continue; }
      const r = await resolveRecipient(o);
      if (!r) { result.skipped++; continue; }
      const name = await productName(o.product_id);
      if (opts.dryRun) {
        result.overdueSent++;
        continue;
      }

      let payUrl: string | undefined;
      let amountCents = o.amount_cents;
      let discountedCents: number | undefined;
      if (o.stripe_subscription_id) {
        try {
          const link = await createDunningSettleLink({ orderId: o.id, subscriptionId: o.stripe_subscription_id, productName: name });
          if (link) {
            payUrl = link.url;
            amountCents = link.originalCents;
            discountedCents = link.discountedCents;
          }
        } catch (e) {
          result.errors.push({ orderId: o.id, error: `settle link: ${e instanceof Error ? e.message : String(e)}` });
        }
      }

      const tone = overdueTone(days);
      const html = tplOverdue({
        customerName: r.name,
        productName: name,
        amountBRL: (amountCents / 100).toFixed(2).replace(".", ","),
        discountedBRL: discountedCents !== undefined ? (discountedCents / 100).toFixed(2).replace(".", ",") : undefined,
        discountPct: DUNNING_DISCOUNT_PCT,
        daysOverdue: days,
        stage: tone,
        payUrl,
      });
      const subjects: Record<OverdueTone, string> = {
        d1: `Pagamento pendente · ${name} — ${DUNNING_DISCOUNT_PCT}% off pra regularizar`,
        d5: `⚠️ Sua assinatura ${name} está em risco — ${DUNNING_DISCOUNT_PCT}% off hoje`,
        d15: `🚨 Último aviso: sua conta será cancelada`,
      };
      const send = await sendEmail({
        to: r.email,
        subject: subjects[tone],
        html,
        tags: [
          { name: "kind", value: "overdue" },
          { name: "stage", value: stage },
          { name: "order_id", value: o.id },
        ],
      });
      if (send.ok && o.user_id) {
        await logSent({ orderId: o.id, userId: o.user_id, campaign: "overdue", stage, email: r.email, queueId: send.id });
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
    .select("id, user_id, product_id, status, amount_cents, current_period_end, grace_until, stripe_subscription_id, updated_at, customer_email, customer_name")
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
        await logSent({ orderId: o.id, userId: o.user_id, campaign: "winback", stage, email: r.email, queueId: send.id });
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
