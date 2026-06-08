import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { VAPID_PUBLIC_KEY } from "./push-config";

let configured = false;
function ensure() {
  if (configured) return;
  const subject = process.env.VAPID_SUBJECT || "mailto:contato@fastproxy.com.br";
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) throw new Error("VAPID_PRIVATE_KEY ausente");
  webpush.setVapidDetails(subject, VAPID_PUBLIC_KEY, priv);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  notificationId?: string;
  requireInteraction?: boolean;
}

/** Envia push a todas as inscrições do usuário. Limpa subs inválidas (404/410). */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  ensure();
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const stale: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 },
        );
        sent++;
      } catch (err: unknown) {
        const status =
          typeof err === "object" && err && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        if (status === 400 || status === 403 || status === 404 || status === 410) {
          stale.push(s.id);
        } else {
          console.error("webpush error", status, err);
        }
        failed++;
      }
    }),
  );

  if (stale.length) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
  }
  return { sent, failed };
}
