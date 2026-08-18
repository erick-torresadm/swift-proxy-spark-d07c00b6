/**
 * Rede de segurança final — pega qualquer pedido pago sem proxy ativo que
 * escapou dos outros mecanismos (backfill do ProxySeller, sync da VPS, etc.)
 * e tenta entregar de novo. Roda a cada 5 min via pg_cron.
 *
 * Para cada order com status='paid', idade entre 3 min e 7 dias, sem
 * customer_proxies ativo:
 *   1. chama allocateProxiesForOrder de novo (idempotente; resolve user_id
 *      nulo pelo e-mail, tenta stock/auto-compra normalmente)
 *   2. se continuar sem proxy e já passou de 12h desde a criação, marca
 *      delivery_issue_at/message (aparece no painel do cliente) e notifica
 *      admin como urgente
 *
 * Auth: mesmo mecanismo dos outros cron hooks (checkCronAuth).
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { allocateProxiesForOrder } from "@/lib/allocation.server";
import { notifyAllAdmins } from "@/lib/notifications.server";
import { checkCronAuth } from "@/lib/cron-auth.server";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export const Route = createFileRoute("/api/public/hooks/reconcile-stuck-orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;

        const nowMs = Date.now();
        const minAge = new Date(nowMs - 3 * 60_000).toISOString();
        const maxAge = new Date(nowMs - 7 * 24 * 60 * 60_000).toISOString();

        const { data: candidates, error } = await supabaseAdmin
          .from("orders")
          .select("id, created_at, delivery_issue_at")
          .eq("status", "paid")
          .lte("created_at", minAge)
          .gte("created_at", maxAge)
          .order("created_at", { ascending: true })
          .limit(50);

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const summary = { checked: candidates?.length ?? 0, resolved: 0, stillStuck: 0, escalated: 0 };

        for (const order of candidates ?? []) {
          const { count } = await supabaseAdmin
            .from("customer_proxies")
            .select("id", { count: "exact", head: true })
            .eq("order_id", order.id)
            .eq("status", "active");

          if ((count ?? 0) > 0) continue; // já entregue, nada a fazer

          summary.stillStuck++;

          try {
            const result = await allocateProxiesForOrder(order.id, { allowAutoPurchase: true });
            if (result.allocated > 0) {
              summary.resolved++;
              if (order.delivery_issue_at) {
                await supabaseAdmin
                  .from("orders")
                  .update({ delivery_issue_at: null, delivery_issue_message: null })
                  .eq("id", order.id);
              }
              continue;
            }
          } catch {
            /* segue pra checagem de escalonamento abaixo */
          }

          const ageMs = nowMs - new Date(order.created_at as string).getTime();
          if (ageMs > TWELVE_HOURS_MS && !order.delivery_issue_at) {
            await supabaseAdmin
              .from("orders")
              .update({
                delivery_issue_at: new Date().toISOString(),
                delivery_issue_message:
                  "Estamos com dificuldade para entregar seu proxy automaticamente. Nossa equipe já foi avisada e vai resolver em breve.",
              })
              .eq("id", order.id);

            summary.escalated++;
            void notifyAllAdmins({
              title: "🛑 Pedido pago há +12h sem proxy — AÇÃO NECESSÁRIA",
              body: `Pedido ${order.id} pago há mais de 12h e ainda sem proxy entregue.`,
              link: "/admin/orders",
              metadata: { orderId: order.id },
              dedupeKey: `stuck-12h:${order.id}`,
            });
          }
        }

        return Response.json({ ok: true, summary });
      },
    },
  },
});
