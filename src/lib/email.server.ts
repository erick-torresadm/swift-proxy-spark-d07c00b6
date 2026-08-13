// Server-only: envio de emails via Resend, sempre via fila (email_queue)
// para respeitar rate-limit configurável (default plano Pro).
// Lê RESEND_API_KEY de process.env dentro de cada chamada.
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

const RESEND_URL = "https://api.resend.com/emails";

// Remetente padrão. Pode ser sobrescrito via env EMAIL_FROM.
const DEFAULT_FROM = "Fast Proxy <onboarding@resend.dev>";

// Limites configuráveis via env. Defaults assumem plano Resend Pro
// (50k/mês, 10 req/s). No plano Free ajuste as envs para
// EMAIL_DAILY_CAP=95, EMAIL_MONTHLY_CAP=2900, EMAIL_MIN_INTERVAL_MS=700,
// EMAIL_BATCH_PER_RUN=6.
function envNum(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
export const RESEND_LIMITS = {
  get daily() { return envNum("EMAIL_DAILY_CAP", 10000); },
  get monthly() { return envNum("EMAIL_MONTHLY_CAP", 50000); },
  get minIntervalMs() { return envNum("EMAIL_MIN_INTERVAL_MS", 150); }, // ~6 req/s
  get batchPerRun() { return envNum("EMAIL_BATCH_PER_RUN", 100); },
};
/** @deprecated use RESEND_LIMITS */
export const RESEND_FREE_LIMITS = RESEND_LIMITS;


export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
  // Quando true, o envio NÃO passa pela fila — chama Resend direto.
  // Usar só em ações manuais críticas (ex.: teste do admin). Padrão: false.
  immediate?: boolean;
  priority?: number; // 1 = mais alto, 10 = mais baixo (default 5)
  metadata?: Record<string, unknown>;
  scheduledAt?: Date;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;          // id da fila (ou id do Resend quando immediate=true)
  status: number;
  error?: string;
  queued?: boolean;
}

/**
 * Enfileira (ou envia direto) um email. Por padrão sempre enfileira para
 * respeitar limites do Resend free. O worker `processEmailQueue()` drena
 * a fila respeitando rate limit e caps diários/mensais.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const to = Array.isArray(params.to) ? params.to[0] : params.to;
  if (!to) return { ok: false, status: 400, error: "destinatário ausente" };

  if (params.immediate) {
    return sendNow({ ...params, to });
  }

  // Enfileira
  try {
    const { data, error } = await supabaseAdmin
      .from("email_queue")
      .insert({
        to_email: to,
        subject: params.subject,
        html: params.html,
        text_body: params.text ?? null,
        from_email: params.from ?? null,
        reply_to: params.replyTo ?? null,
        tags: params.tags ?? null,
        metadata: (params.metadata ?? null) as never,
        priority: params.priority ?? 5,
        scheduled_at: (params.scheduledAt ?? new Date()).toISOString(),
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, status: 500, error: error?.message ?? "falha ao enfileirar" };
    }
    return { ok: true, id: data.id, status: 202, queued: true };
  } catch (e) {
    return { ok: false, status: 500, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Envia DIRETO via Resend (usado pelo worker e por chamadas immediate).
 * Não respeita fila/rate-limit — chame apenas em contexto controlado.
 */
export async function sendNow(params: SendEmailParams & { to: string | string[] }): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 0, error: "RESEND_API_KEY ausente" };
  }
  const from = params.from || process.env.EMAIL_FROM || DEFAULT_FROM;

  const body = {
    from,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    html: params.html,
    text: params.text,
    reply_to: params.replyTo,
    tags: params.tags,
  };

  let status = 0;
  let id: string | undefined;
  let error: string | undefined;
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    status = res.status;
    const text = await res.text();
    let json: { id?: string; message?: string; name?: string } = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
    if (res.ok) {
      id = json.id;
    } else {
      error = json.message || json.name || text || `HTTP ${status}`;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // Audit log
  try {
    await supabaseAdmin.from("audit_log").insert({
      source: "resend",
      action: "send_email",
      status: status >= 200 && status < 300 ? "ok" : "error",
      request: { to: body.to, subject: body.subject, from, tags: body.tags ?? null },
      response: { status, id, error: error ?? null },
    });
  } catch { /* ignore */ }

  return { ok: status >= 200 && status < 300, id, status, error };
}


// ============================================================
// Templates
// ============================================================

const BRAND = {
  name: "Fast Proxy",
  primary: "#0ea5e9",
  bg: "#ffffff",
  fg: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  url: "https://fastproxy.app",
};

function layout(opts: { preview: string; title: string; bodyHtml: string }): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${BRAND.fg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
      <tr><td style="padding:24px 28px;border-bottom:1px solid ${BRAND.border};">
        <div style="font-size:18px;font-weight:800;color:${BRAND.primary};letter-spacing:-0.01em;">${BRAND.name}</div>
      </td></tr>
      <tr><td style="padding:28px;">
        ${opts.bodyHtml}
      </td></tr>
      <tr><td style="padding:20px 28px;border-top:1px solid ${BRAND.border};background:#f8fafc;font-size:12px;color:${BRAND.muted};">
        Você recebeu este email porque tem uma conta no ${BRAND.name}.<br/>
        <a href="${BRAND.url}" style="color:${BRAND.muted};">${BRAND.url}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function btn(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;font-size:14px;">${escapeHtml(label)}</a>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ----- Templates específicos -----

export function tplTest(name?: string) {
  return layout({
    preview: "Email de teste do Fast Proxy",
    title: "Teste de email",
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;">Tudo certo, ${escapeHtml(name || "admin")}!</h1>
      <p style="margin:0 0 16px;color:${BRAND.muted};line-height:1.6;">
        Esse é um email de teste enviado pelo seu painel do ${BRAND.name} usando o Resend.
        Se você está lendo isso, sua configuração está funcionando.
      </p>
      <p style="margin:24px 0 0;">${btn(BRAND.url + "/admin", "Abrir painel")}</p>
    `,
  });
}

export function tplPasswordRecovery(opts: {
  email: string;
  resetUrl: string;
  magicUrl: string;
}) {
  return layout({
    preview: "Recupere o acesso à sua conta Fast Proxy",
    title: "Recuperar acesso",
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;">Recupere o acesso à sua conta</h1>
      <p style="margin:0 0 16px;color:${BRAND.muted};line-height:1.6;">
        Recebemos um pedido para <b>${escapeHtml(opts.email)}</b>. Escolha uma das opções abaixo:
      </p>
      <p style="margin:0 0 10px;">${btn(opts.resetUrl, "Definir nova senha")}</p>
      <p style="margin:0 0 18px;color:${BRAND.muted};font-size:13px;line-height:1.6;">
        Crie uma nova senha para acessar sua conta.
      </p>
      <p style="margin:0 0 10px;">${btn(opts.magicUrl, "Entrar com link mágico")}</p>
      <p style="margin:0 0 18px;color:${BRAND.muted};font-size:13px;line-height:1.6;">
        Entre direto na sua conta, sem precisar digitar a senha.
      </p>
      <p style="margin:18px 0 0;color:${BRAND.muted};font-size:12px;line-height:1.6;">
        Os links são válidos por 1 hora e podem ser usados uma única vez.
        Se você não pediu isso, ignore este email — nada será alterado.
      </p>
    `,
  });
}

export function tplOrderPaid(opts: {
  customerName?: string;
  productName: string;
  quantity: number;
  amountBRL: string;
  orderId: string;
}) {
  return layout({
    preview: `Pagamento confirmado · ${opts.productName}`,
    title: "Pagamento confirmado",
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;">Pagamento confirmado 🎉</h1>
      <p style="margin:0 0 8px;color:${BRAND.muted};line-height:1.6;">Olá ${escapeHtml(opts.customerName || "")}, recebemos seu pagamento. Estamos liberando seus proxies agora.</p>
      <table cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid ${BRAND.border};border-radius:8px;width:100%;">
        <tr><td style="padding:10px 14px;color:${BRAND.muted};font-size:13px;">Produto</td><td style="padding:10px 14px;text-align:right;font-weight:600;">${escapeHtml(opts.productName)}</td></tr>
        <tr><td style="padding:10px 14px;color:${BRAND.muted};font-size:13px;border-top:1px solid ${BRAND.border};">Quantidade</td><td style="padding:10px 14px;text-align:right;font-weight:600;border-top:1px solid ${BRAND.border};">${opts.quantity}</td></tr>
        <tr><td style="padding:10px 14px;color:${BRAND.muted};font-size:13px;border-top:1px solid ${BRAND.border};">Valor</td><td style="padding:10px 14px;text-align:right;font-weight:700;color:${BRAND.primary};border-top:1px solid ${BRAND.border};">R$ ${escapeHtml(opts.amountBRL)}</td></tr>
        <tr><td style="padding:10px 14px;color:${BRAND.muted};font-size:13px;border-top:1px solid ${BRAND.border};">Pedido</td><td style="padding:10px 14px;text-align:right;font-family:monospace;font-size:12px;border-top:1px solid ${BRAND.border};">${escapeHtml(opts.orderId.slice(0, 8))}</td></tr>
      </table>
      <p style="margin:0;">${btn(BRAND.url + "/dashboard/proxies", "Ver meus proxies")}</p>
    `,
  });
}

export function tplProxyDelivered(opts: { customerName?: string; count: number }) {
  return layout({
    preview: `${opts.count} proxy(s) prontos para uso`,
    title: "Seus proxies estão prontos",
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;">Seus proxies estão prontos</h1>
      <p style="margin:0 0 16px;color:${BRAND.muted};line-height:1.6;">
        Olá ${escapeHtml(opts.customerName || "")}, alocamos <b>${opts.count}</b> proxy(s) na sua conta.
        Acesse o painel para copiar as credenciais (host:porta:usuário:senha).
      </p>
      <p>${btn(BRAND.url + "/dashboard/proxies", "Acessar proxies")}</p>
    `,
  });
}

export function tplRenewalWarning(opts: {
  customerName?: string;
  productName: string;
  daysLeft: number;
}) {
  return layout({
    preview: `Seu plano vence em ${opts.daysLeft} dias`,
    title: "Renovação próxima",
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;">Renovação em ${opts.daysLeft} dias</h1>
      <p style="margin:0 0 16px;color:${BRAND.muted};line-height:1.6;">
        Olá ${escapeHtml(opts.customerName || "")}, seu plano <b>${escapeHtml(opts.productName)}</b> vence em ${opts.daysLeft} dias.
        Mantenha a assinatura ativa para continuar usando seus proxies sem interrupção.
      </p>
      <p>${btn(BRAND.url + "/dashboard/orders", "Gerenciar assinatura")}</p>
    `,
  });
}

export function tplGracePeriod(opts: { customerName?: string; daysLeft: number }) {
  return layout({
    preview: `Pagamento pendente · ${opts.daysLeft} dias restantes`,
    title: "Pagamento pendente",
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#dc2626;">Pagamento pendente</h1>
      <p style="margin:0 0 16px;color:${BRAND.muted};line-height:1.6;">
        Olá ${escapeHtml(opts.customerName || "")}, identificamos uma falha no pagamento da sua assinatura.
        Você tem <b>${opts.daysLeft} dias</b> para regularizar antes que os proxies sejam desativados.
      </p>
      <p>${btn(BRAND.url + "/dashboard/orders", "Regularizar agora")}</p>
    `,
  });
}

// ============================================================
// Dunning / Win-back templates (escalating cadence)
// ============================================================

export type OverdueStage = "d1" | "d5" | "d15";
export type WinbackStage = "d7" | "d20" | "d45";

export function tplOverdue(opts: {
  customerName?: string;
  productName: string;
  amountBRL: string;
  daysOverdue: number;
  stage: OverdueStage;
  payUrl?: string;
}) {
  const name = escapeHtml(opts.customerName || "cliente");
  const product = escapeHtml(opts.productName);
  const pay = opts.payUrl || (BRAND.url + "/dashboard/orders");

  const variants: Record<OverdueStage, { preview: string; title: string; emoji: string; color: string; headline: string; body: string; cta: string }> = {
    d1: {
      preview: `Lembrete amigável: seu pagamento ficou pendente`,
      title: "Pagamento pendente",
      emoji: "👋",
      color: BRAND.primary,
      headline: "Identificamos uma falha no seu pagamento",
      body: `<p style="margin:0 0 14px;color:${BRAND.fg};line-height:1.6;font-size:15px;">Olá ${name}, tudo bem? Tentamos cobrar sua assinatura do <b>${product}</b> mas o pagamento não foi concluído.</p>
             <p style="margin:0 0 14px;color:${BRAND.muted};line-height:1.6;">Pode ser só um detalhe do cartão. Atualize agora e seus proxies continuam funcionando normalmente, sem interrupção.</p>`,
      cta: "Atualizar pagamento",
    },
    d5: {
      preview: `Atenção: sua assinatura está prestes a ser desativada`,
      title: "Aviso importante",
      emoji: "⚠️",
      color: "#f59e0b",
      headline: "Sua assinatura está em risco",
      body: `<p style="margin:0 0 14px;color:${BRAND.fg};line-height:1.6;font-size:15px;">Olá ${name}, já se passaram <b>${opts.daysOverdue} dias</b> desde a falha no pagamento de <b>${product}</b>.</p>
             <p style="margin:0 0 14px;color:${BRAND.muted};line-height:1.6;">Se você não regularizar nos próximos dias, vamos <b>desativar seus proxies</b> e cancelar a assinatura automaticamente. Não queremos que isso aconteça.</p>`,
      cta: "Regularizar agora",
    },
    d15: {
      preview: `Último aviso antes do cancelamento da sua conta`,
      title: "Último aviso",
      emoji: "🚨",
      color: "#dc2626",
      headline: "Último aviso: sua conta será cancelada",
      body: `<p style="margin:0 0 14px;color:${BRAND.fg};line-height:1.6;font-size:15px;">Olá ${name}, este é o <b>último aviso</b>. Sua assinatura de <b>${product}</b> está com pagamento pendente há <b>${opts.daysOverdue} dias</b>.</p>
             <p style="margin:0 0 14px;color:${BRAND.muted};line-height:1.6;">Se não recebermos o pagamento, sua conta será cancelada e seus proxies desativados permanentemente. Resolva agora em menos de 2 minutos:</p>`,
      cta: "Pagar agora e manter conta",
    },
  };

  const v = variants[opts.stage];

  return layout({
    preview: v.preview,
    title: v.title,
    bodyHtml: `
      <div style="background:${v.color};color:#fff;padding:14px 18px;border-radius:8px;margin:0 0 22px;font-weight:700;font-size:14px;">
        ${v.emoji}&nbsp; ${escapeHtml(v.title)}
      </div>
      <h1 style="margin:0 0 14px;font-size:22px;color:${v.color};line-height:1.3;">${escapeHtml(v.headline)}</h1>
      ${v.body}
      <table cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid ${BRAND.border};border-radius:8px;width:100%;">
        <tr><td style="padding:10px 14px;color:${BRAND.muted};font-size:13px;">Plano</td><td style="padding:10px 14px;text-align:right;font-weight:600;">${product}</td></tr>
        <tr><td style="padding:10px 14px;color:${BRAND.muted};font-size:13px;border-top:1px solid ${BRAND.border};">Valor pendente</td><td style="padding:10px 14px;text-align:right;font-weight:700;color:${v.color};border-top:1px solid ${BRAND.border};">R$ ${escapeHtml(opts.amountBRL)}</td></tr>
        <tr><td style="padding:10px 14px;color:${BRAND.muted};font-size:13px;border-top:1px solid ${BRAND.border};">Dias em atraso</td><td style="padding:10px 14px;text-align:right;font-weight:600;border-top:1px solid ${BRAND.border};">${opts.daysOverdue}</td></tr>
      </table>
      <p style="margin:24px 0 8px;">
        <a href="${pay}" style="display:inline-block;background:${v.color};color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;">${escapeHtml(v.cta)}</a>
      </p>
      <p style="margin:18px 0 0;color:${BRAND.muted};font-size:13px;line-height:1.6;">
        Dúvidas? Responda este email ou fale com a gente no painel.
      </p>
    `,
  });
}

export function tplWinback(opts: {
  customerName?: string;
  productName: string;
  couponCode: string;
  couponPct: number;
  stage: WinbackStage;
  daysSinceCancel: number;
}) {
  const name = escapeHtml(opts.customerName || "");
  const product = escapeHtml(opts.productName);
  const code = escapeHtml(opts.couponCode);
  const backUrl = `${BRAND.url}/checkout?coupon=${encodeURIComponent(opts.couponCode)}`;

  const variants: Record<WinbackStage, { preview: string; title: string; emoji: string; headline: string; body: string; cta: string; urgency?: string }> = {
    d7: {
      preview: `Sentimos sua falta · ${opts.couponPct}% off para voltar`,
      title: "A gente sente sua falta",
      emoji: "💙",
      headline: `Que tal voltar com ${opts.couponPct}% off?`,
      body: `<p style="margin:0 0 14px;color:${BRAND.fg};line-height:1.6;font-size:15px;">Oi ${name || "tudo bem"}? Notamos que você cancelou seu plano <b>${product}</b> faz pouco tempo.</p>
             <p style="margin:0 0 14px;color:${BRAND.muted};line-height:1.6;">Se foi pelo preço, pela qualidade ou só por uma pausa — queremos te ter de volta. Preparamos um cupom exclusivo de <b>${opts.couponPct}% de desconto</b> só pra você.</p>`,
      cta: "Voltar com desconto",
    },
    d20: {
      preview: `Última semana do seu cupom de ${opts.couponPct}% off`,
      title: "Seu cupom está acabando",
      emoji: "⏰",
      headline: `Seus ${opts.couponPct}% de desconto estão expirando`,
      body: `<p style="margin:0 0 14px;color:${BRAND.fg};line-height:1.6;font-size:15px;">Oi ${name || "tudo bem"}, faz <b>${opts.daysSinceCancel} dias</b> que você não usa o Fast Proxy.</p>
             <p style="margin:0 0 14px;color:${BRAND.muted};line-height:1.6;">Seu cupom de <b>${opts.couponPct}% off</b> ainda está valendo, mas não por muito tempo. Aproveite enquanto dá — proxies BR/US estáveis, suporte rápido, sem fidelidade.</p>`,
      cta: "Usar meu cupom agora",
      urgency: "Cupom por tempo limitado",
    },
    d45: {
      preview: `Uma última oferta especial pra você voltar`,
      title: "Última chance",
      emoji: "🎁",
      headline: "Uma oferta final só pra você",
      body: `<p style="margin:0 0 14px;color:${BRAND.fg};line-height:1.6;font-size:15px;">Oi ${name || "tudo bem"}, essa é a última vez que vamos te incomodar — prometido.</p>
             <p style="margin:0 0 14px;color:${BRAND.muted};line-height:1.6;">Se você quiser voltar, o cupom <b>${code}</b> com <b>${opts.couponPct}% off</b> está reservado. Caso contrário, não enviaremos mais ofertas. Boa sorte com seus projetos!</p>`,
      cta: "Ativar oferta final",
      urgency: "Última chance",
    },
  };

  const v = variants[opts.stage];

  return layout({
    preview: v.preview,
    title: v.title,
    bodyHtml: `
      ${v.urgency ? `<div style="background:#fef3c7;color:#92400e;padding:10px 14px;border-radius:6px;margin:0 0 18px;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">⏰ ${escapeHtml(v.urgency)}</div>` : ""}
      <h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;">${v.emoji} ${escapeHtml(v.headline)}</h1>
      ${v.body}
      <div style="background:linear-gradient(135deg, ${BRAND.primary} 0%, #6366f1 100%);color:#fff;padding:22px;border-radius:12px;margin:22px 0;text-align:center;">
        <div style="font-size:12px;opacity:0.85;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Seu cupom exclusivo</div>
        <div style="font-size:32px;font-weight:800;letter-spacing:0.05em;font-family:monospace;margin-bottom:4px;">${code}</div>
        <div style="font-size:14px;opacity:0.9;">${opts.couponPct}% de desconto na sua próxima assinatura</div>
      </div>
      <p style="margin:24px 0 8px;text-align:center;">
        <a href="${backUrl}" style="display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;">${escapeHtml(v.cta)}</a>
      </p>
      <p style="margin:18px 0 0;color:${BRAND.muted};font-size:13px;line-height:1.6;text-align:center;">
        Sem fidelidade · Cancele quando quiser · Suporte em português
      </p>
    `,
  });
}

