// Server-only: envio de emails via Resend.
// Lê RESEND_API_KEY de process.env dentro de cada chamada.
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

const RESEND_URL = "https://api.resend.com/emails";

// Remetente padrão. Pode ser sobrescrito via env EMAIL_FROM.
// onboarding@resend.dev funciona sem domínio verificado, mas só envia para o
// dono da conta Resend. Para produção, configure EMAIL_FROM com seu domínio.
const DEFAULT_FROM = "Fast Proxy <onboarding@resend.dev>";

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  status: number;
  error?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
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

  // Audit log (best-effort, não bloqueia)
  try {
    await supabaseAdmin.from("audit_log").insert({
      source: "resend",
      action: "send_email",
      status: status >= 200 && status < 300 ? "ok" : "error",
      request: {
        to: body.to,
        subject: body.subject,
        from,
        tags: body.tags ?? null,
      },
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
