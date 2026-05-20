import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser } from "./push.server";

export type NotificationKind =
  | "expiring_soon"
  | "expired"
  | "payment_failed"
  | "payment_succeeded"
  | "grace_ending"
  | "rotation_reset"
  | "promo"
  | "system";

export interface EnqueueArgs {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
  /** Try to send push imediatamente. Falhas não bloqueiam a criação do registro. */
  sendImmediately?: boolean;
}

/**
 * Cria notificação (com dedupe opcional) e opcionalmente dispara push agora.
 * Email é processado pelo cron `dispatch-notifications`.
 */
export async function enqueueNotification(args: EnqueueArgs) {
  const row = {
    user_id: args.userId,
    kind: args.kind,
    title: args.title,
    body: args.body,
    link: args.link ?? null,
    metadata: args.metadata ?? null,
    dedupe_key: args.dedupeKey ?? null,
  };

  const { data: inserted, error } = await supabaseAdmin
    .from("notifications")
    .insert(row)
    .select("id")
    .maybeSingle();

  // Conflito de dedupe = já notificamos antes; ignora silenciosamente
  if (error && !/duplicate key|unique constraint/i.test(error.message)) {
    console.error("enqueueNotification insert error", error);
    return null;
  }

  if (!inserted) return null;

  if (args.sendImmediately) {
    try {
      const res = await sendPushToUser(args.userId, {
        title: args.title,
        body: args.body,
        url: args.link,
        notificationId: inserted.id,
        tag: args.kind,
      });
      await supabaseAdmin
        .from("notifications")
        .update({
          push_status: res.sent > 0 ? "sent" : "failed",
          sent_at: new Date().toISOString(),
        })
        .eq("id", inserted.id);
    } catch (e) {
      console.error("immediate push failed", e);
    }
  }

  return inserted.id;
}
