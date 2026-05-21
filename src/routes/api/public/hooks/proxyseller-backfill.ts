/**
 * Backfill job — completa provider_orders pendentes onde os IPs ainda não
 * estavam prontos no momento do /order/make. Roda a cada 1 min via pg_cron.
 *
 * Para cada provider_orders com status='pending' e idade > 20s e < 30 min:
 *   1. consulta /proxy/list/ipv6?orderId={baseOrderNumber}
 *   2. se vierem IPs, insere em proxy_stock e marca order como 'active'
 *   3. se houver triggered_by_order_id, dispara allocateProxiesForOrder
 *   4. notifica admin: "Estoque renovado"
 *
 * Auth: header `apikey` deve bater com SUPABASE_PUBLISHABLE_KEY.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { pollProxiesForOrder, psDateToIso, generateSimulatedProxies } from "@/lib/proxyseller.server";
import { allocateProxiesForOrder } from "@/lib/allocation.server";
import { notifyAllAdmins } from "@/lib/notifications.server";

export const Route = createFileRoute("/api/public/hooks/proxyseller-backfill")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const nowMs = Date.now();
        const minAge = new Date(nowMs - 20_000).toISOString(); // ≥20s old
        const maxAge = new Date(nowMs - 30 * 60_000).toISOString(); // ≤30 min old

        const { data: pending, error } = await supabaseAdmin
          .from("provider_orders")
          .select(
            "id, product_id, raw_payload, triggered_by_order_id, country_code, created_at",
          )
          .eq("status", "pending")
          .lte("created_at", minAge)
          .gte("created_at", maxAge)
          .order("created_at", { ascending: true })
          .limit(20);

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const summary = {
          checked: pending?.length ?? 0,
          recovered: 0,
          allocated: 0,
          errors: [] as string[],
        };

        for (const po of pending ?? []) {
          const payload = po.raw_payload as {
            baseOrderNumber?: string;
            dryRun?: boolean;
            simulateReadyAt?: string;
            quantityRequested?: number;
          } | null;
          const baseOrderNumber = payload?.baseOrderNumber;
          if (!baseOrderNumber || !po.product_id) continue;

          try {
            let proxies;
            if (payload?.dryRun) {
              // Simulated order — wait until fake provisioning window passes
              if (!payload.simulateReadyAt || new Date(payload.simulateReadyAt) > new Date()) {
                continue;
              }
              const qty = payload.quantityRequested || 1;
              proxies = generateSimulatedProxies(baseOrderNumber, qty, po.country_code);
            } else {
              proxies = await pollProxiesForOrder(baseOrderNumber, 1, [0]);
            }
            if (proxies.length === 0) continue;

            const stockRows = proxies.map((p) => ({
              product_id: po.product_id as string,
              provider_order_id: po.id,
              external_proxy_id: p.id,
              host: p.ip_only || p.ip,
              port: p.port_http,
              username: p.login,
              password: p.password,
              protocol: (p.protocol || "http").toLowerCase(),
              country_code: po.country_code,
              status: "available" as const,
              expires_at: psDateToIso(p.date_end),
            }));

            const { error: insErr } = await supabaseAdmin
              .from("proxy_stock")
              .insert(stockRows);
            if (insErr) {
              summary.errors.push(`stock insert ${baseOrderNumber}: ${insErr.message}`);
              continue;
            }

            await supabaseAdmin
              .from("provider_orders")
              .update({ status: "active", quantity: stockRows.length })
              .eq("id", po.id);

            summary.recovered += stockRows.length;

            void notifyAllAdmins({
              title: "📦 Estoque renovado",
              body: `+${stockRows.length} IPs entregues via backfill (${po.country_code ?? "?"}).`,
              link: "/admin/inventory",
              metadata: { providerOrderId: po.id, added: stockRows.length },
              dedupeKey: `restock-backfill:${po.id}`,
            });

            // Finaliza alocação do cliente que disparou esta compra
            if (po.triggered_by_order_id) {
              try {
                const r = await allocateProxiesForOrder(po.triggered_by_order_id);
                summary.allocated += r.allocated;
              } catch (e) {
                summary.errors.push(
                  `allocate ${po.triggered_by_order_id}: ${e instanceof Error ? e.message : String(e)}`,
                );
              }
            }
          } catch (e) {
            summary.errors.push(
              `${baseOrderNumber}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }

        return Response.json({ ok: true, summary });
      },
    },
  },
});
