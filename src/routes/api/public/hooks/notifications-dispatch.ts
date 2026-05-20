import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser } from "@/lib/push.server";
import { enqueueNotification } from "@/lib/notifications.server";

/**
 * Cron diário: escaneia expirações próximas e despacha pushes pendentes.
 * Chamado por pg_cron — proteção: header x-cron-key opcional + endpoint
 * /api/public/* (já bypassa auth). Tudo lê do banco direto.
 */
export const Route = createFileRoute("/api/public/hooks/notifications-dispatch")({
  server: {
    handlers: {
      POST: async () => {
        const summary = {
          expiry_scanned: 0,
          expiry_enqueued: 0,
          push_sent: 0,
          push_failed: 0,
        };

        // 1) Escanear pedidos ativos prestes a expirar e enfileirar avisos
        const { data: orders } = await supabaseAdmin
          .from("orders")
          .select(
            "id, user_id, current_period_end, status, products(name, notify_expiry_days)",
          )
          .in("status", ["active"])
          .not("current_period_end", "is", null)
          .not("user_id", "is", null);

        const now = Date.now();
        const day = 86400000;
        for (const o of orders ?? []) {
          summary.expiry_scanned++;
          const end = o.current_period_end
            ? new Date(o.current_period_end).getTime()
            : 0;
          if (!end || !o.user_id) continue;
          const daysLeft = Math.floor((end - now) / day);
          const triggers = (o.products?.notify_expiry_days ?? [7, 3, 1]) as number[];
          if (!triggers.includes(daysLeft)) continue;

          const ok = await enqueueNotification({
            userId: o.user_id,
            kind: "expiring_soon",
            title: `${o.products?.name ?? "Seu proxy"} expira em ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"}`,
            body:
              daysLeft <= 1
                ? "Renove agora pra não perder seu IP."
                : "Renovação automática se você tem cartão salvo. Caso contrário, renove no painel.",
            link: "/dashboard/orders",
            dedupeKey: `expiring-${o.id}-${daysLeft}`,
          });
          if (ok) summary.expiry_enqueued++;
        }

        // 2) Despachar pushes pendentes
        const { data: pending } = await supabaseAdmin
          .from("notifications")
          .select("id, user_id, title, body, link, kind")
          .eq("push_status", "pending")
          .order("created_at", { ascending: true })
          .limit(200);

        for (const n of pending ?? []) {
          try {
            const res = await sendPushToUser(n.user_id, {
              title: n.title,
              body: n.body,
              url: n.link ?? "/dashboard/notificacoes",
              notificationId: n.id,
              tag: n.kind,
            });
            await supabaseAdmin
              .from("notifications")
              .update({
                push_status: res.sent > 0 ? "sent" : "failed",
                sent_at: new Date().toISOString(),
              })
              .eq("id", n.id);
            summary.push_sent += res.sent;
            summary.push_failed += res.failed;
          } catch (e) {
            console.error("dispatch push error", e);
            await supabaseAdmin
              .from("notifications")
              .update({ push_status: "failed" })
              .eq("id", n.id);
            summary.push_failed++;
          }
        }

        return new Response(JSON.stringify({ ok: true, ...summary }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
