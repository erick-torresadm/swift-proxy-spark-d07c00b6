/**
 * Webhook do Resend para receber eventos de email (delivered, opened,
 * clicked, bounced, complained). Atualiza dunning_emails pelo resend_id.
 *
 * Configuração no Resend:
 *   URL: https://www.fastproxy.com.br/api/public/hooks/resend-events
 *   Eventos: email.delivered, email.opened, email.clicked, email.bounced, email.complained
 *   Signing secret: salvar como RESEND_WEBHOOK_SECRET (Svix format `whsec_...`)
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

function verifySvix(secret: string, body: string, headers: Headers): boolean {
  // Resend usa Svix. Header: svix-signature: "v1,base64sig v1,base64sig"
  const id = headers.get("svix-id") ?? headers.get("webhook-id") ?? "";
  const ts = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp") ?? "";
  const sigHeader = headers.get("svix-signature") ?? headers.get("webhook-signature") ?? "";
  if (!id || !ts || !sigHeader) return false;

  // secret pode vir como "whsec_BASE64"
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Buffer;
  try { key = Buffer.from(raw, "base64"); } catch { return false; }

  const toSign = `${id}.${ts}.${body}`;
  const expected = createHmac("sha256", key).update(toSign).digest("base64");

  for (const part of sigHeader.split(" ")) {
    const [, provided] = part.split(",");
    if (!provided) continue;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

interface ResendEvent {
  type?: string;
  data?: {
    email_id?: string;
    to?: string[];
  };
}

export const Route = createFileRoute("/api/public/hooks/resend-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const secret = process.env.RESEND_WEBHOOK_SECRET;
        if (secret) {
          if (!verifySvix(secret, body, request.headers)) {
            return new Response("Invalid signature", { status: 401 });
          }
        }
        // Sem secret configurado: aceita mas marca para o admin saber
        let evt: ResendEvent;
        try { evt = JSON.parse(body); } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const emailId = evt.data?.email_id;
        const type = evt.type;
        if (!emailId || !type) return Response.json({ ok: true, ignored: true });

        const now = new Date().toISOString();
        const updates: Record<string, string | null> = {};
        if (type === "email.delivered") updates.delivered_at = now;
        else if (type === "email.opened") updates.opened_at = now;
        else if (type === "email.clicked") updates.clicked_at = now;
        else if (type === "email.bounced") updates.bounced_at = now;
        else if (type === "email.complained") updates.complained_at = now;
        else return Response.json({ ok: true, ignored: type });

        const { error } = await supabaseAdmin
          .from("dunning_emails")
          .update(updates)
          .eq("resend_id", emailId);

        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        return Response.json({ ok: true, type });
      },
    },
  },
});
