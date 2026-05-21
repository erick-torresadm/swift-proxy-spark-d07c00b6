import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (!(data ?? []).some((r) => r.role === "admin")) {
    throw new Error("Acesso negado");
  }
}

const targetSchema = z.union([
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("user"), userId: z.string().uuid() }),
]);

/** Lista usuários (admin) para escolher destinatário. */
export const listUsersForBroadcast = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name, phone")
      .order("created_at", { ascending: false })
      .limit(500);

    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 500,
    });
    const emailById = new Map<string, string>();
    for (const u of authList?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email);
    }
    return (profiles ?? []).map((p) => ({
      user_id: p.user_id,
      full_name: p.full_name,
      phone: p.phone,
      email: emailById.get(p.user_id) ?? null,
    }));
  });

/** Envia push customizado. */
export const adminSendPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        target: targetSchema,
        title: z.string().min(1).max(80),
        body: z.string().min(1).max(300),
        url: z.string().max(500).optional().or(z.literal("")),
        tag: z.string().max(80).optional().or(z.literal("")),
        requireInteraction: z.boolean().optional(),
        persist: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { sendPushToUser } = await import("./push.server");

    let userIds: string[] = [];
    if (data.target.kind === "all") {
      const { data: subs } = await supabaseAdmin
        .from("push_subscriptions")
        .select("user_id");
      userIds = Array.from(new Set((subs ?? []).map((s) => s.user_id)));
    } else {
      userIds = [data.target.userId];
    }

    let totalSent = 0;
    let totalFailed = 0;
    const url = data.url && data.url.length > 0 ? data.url : undefined;
    const tag = data.tag && data.tag.length > 0 ? data.tag : "admin-broadcast";

    for (const uid of userIds) {
      try {
        const res = await sendPushToUser(uid, {
          title: data.title,
          body: data.body,
          url,
          tag,
          requireInteraction: data.requireInteraction ?? false,
        });
        totalSent += res.sent;
        totalFailed += res.failed;

        if (data.persist) {
          await supabaseAdmin.from("notifications").insert({
            user_id: uid,
            kind: "system",
            title: data.title,
            body: data.body,
            link: url ?? null,
            push_status: res.sent > 0 ? "sent" : "failed",
            email_status: "pending",
            sent_at: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.error("adminSendPush user error", uid, e);
        totalFailed++;
      }
    }

    return { recipients: userIds.length, sent: totalSent, failed: totalFailed };
  });

/** Envia email customizado. */
export const adminSendEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        target: targetSchema,
        subject: z.string().min(1).max(200),
        heading: z.string().max(200).optional().or(z.literal("")),
        message: z.string().min(1).max(5000),
        ctaLabel: z.string().max(60).optional().or(z.literal("")),
        ctaUrl: z.string().max(500).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { sendEmail } = await import("./email.server");

    let emails: { id: string; email: string }[] = [];

    if (data.target.kind === "all") {
      const { data: authList } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      emails = (authList?.users ?? [])
        .filter((u) => !!u.email)
        .map((u) => ({ id: u.id, email: u.email! }));
    } else {
      const { data: user } = await supabaseAdmin.auth.admin.getUserById(
        data.target.userId,
      );
      if (user.user?.email) {
        emails = [{ id: user.user.id, email: user.user.email }];
      }
    }

    const heading = data.heading && data.heading.length > 0 ? data.heading : data.subject;
    const ctaUrl = data.ctaUrl && data.ctaUrl.length > 0 ? data.ctaUrl : null;
    const ctaLabel = data.ctaLabel && data.ctaLabel.length > 0 ? data.ctaLabel : "Abrir";

    const escape = (s: string) =>
      s
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

    const paragraphs = data.message
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 14px;color:#334155;line-height:1.6;">${escape(p).replace(/\n/g, "<br/>")}</p>`)
      .join("");

    const ctaHtml = ctaUrl
      ? `<p style="margin:24px 0 0;"><a href="${escape(ctaUrl)}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;font-size:14px;">${escape(ctaLabel)}</a></p>`
      : "";

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${escape(data.subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
<tr><td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;"><div style="font-size:18px;font-weight:800;color:#0ea5e9;">Fast Proxy</div></td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 14px;font-size:22px;">${escape(heading)}</h1>
${paragraphs}
${ctaHtml}
</td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;color:#64748b;">Você recebeu este email porque tem uma conta no Fast Proxy.</td></tr>
</table></td></tr></table></body></html>`;

    let sent = 0;
    let failed = 0;
    for (const e of emails) {
      const r = await sendEmail({
        to: e.email,
        subject: data.subject,
        html,
        tags: [{ name: "kind", value: "admin_broadcast" }],
      });
      if (r.ok) sent++;
      else failed++;
    }

    return { recipients: emails.length, sent, failed };
  });
