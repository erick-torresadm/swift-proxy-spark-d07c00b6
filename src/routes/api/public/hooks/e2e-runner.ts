/**
 * ENDPOINT TEMPORÁRIO DE TESTE E2E. Deletar após uso.
 * GET ?phase=allocate | ?phase=fast-forward | ?phase=backfill | ?phase=sync | ?phase=report | ?phase=cleanup
 * Auth: header apikey = SUPABASE_PUBLISHABLE_KEY
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { allocateProxiesForOrder } from "@/lib/allocation.server";
import { checkCronAuth } from "@/lib/cron-auth.server";

const TEST_ORDER_IDS = [
  "11111111-0000-0000-0000-000000000001",
  "11111111-0000-0000-0000-000000000002",
  "11111111-0000-0000-0000-000000000003",
  "11111111-0000-0000-0000-000000000004",
  "11111111-0000-0000-0000-000000000005",
  "11111111-0000-0000-0000-000000000006",
  "11111111-0000-0000-0000-000000000007",
];

async function snapshot() {
  const { data: stock } = await supabaseAdmin.rpc("get_db_usage").select().limit(0);
  void stock;
  const { data: rows } = await supabaseAdmin
    .from("proxy_stock")
    .select("product_id, status");
  const byProd: Record<string, { available: number; allocated: number }> = {};
  for (const r of rows ?? []) {
    const k = r.product_id as string;
    byProd[k] = byProd[k] ?? { available: 0, allocated: 0 };
    if (r.status === "available") byProd[k].available++;
    if (r.status === "allocated") byProd[k].allocated++;
  }

  const { data: po } = await supabaseAdmin
    .from("provider_orders")
    .select("id, product_id, status, quantity, triggered_by_order_id, raw_payload, created_at")
    .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString())
    .order("created_at", { ascending: false });

  const { data: cp } = await supabaseAdmin
    .from("customer_proxies")
    .select("id, order_id, stock_id, status, allocated_at")
    .in("order_id", TEST_ORDER_IDS);

  return { stock_by_product: byProd, provider_orders: po, customer_proxies: cp };
}

export const Route = createFileRoute("/api/public/hooks/e2e-runner")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;

        const url = new URL(request.url);
        const phase = url.searchParams.get("phase") ?? "report";

        if (phase === "allocate") {
          const results: Array<Record<string, unknown>> = [];
          for (const oid of TEST_ORDER_IDS) {
            try {
              const r = await allocateProxiesForOrder(oid);
              results.push({ orderId: oid, ...r });
            } catch (e) {
              results.push({ orderId: oid, error: e instanceof Error ? e.message : String(e) });
            }
          }
          // Re-run to test idempotency
          const second: Array<Record<string, unknown>> = [];
          for (const oid of TEST_ORDER_IDS) {
            try {
              const r = await allocateProxiesForOrder(oid);
              second.push({ orderId: oid, ...r });
            } catch (e) {
              second.push({ orderId: oid, error: e instanceof Error ? e.message : String(e) });
            }
          }
          return Response.json({ phase, first: results, idempotent_second: second, snapshot: await snapshot() });
        }

        if (phase === "fast-forward") {
          // Acelera o teste: reescreve simulateReadyAt pra agora-1s nos provider_orders dryRun
          const { data: pending } = await supabaseAdmin
            .from("provider_orders")
            .select("id, raw_payload")
            .eq("status", "pending");
          let updated = 0;
          for (const p of pending ?? []) {
            const rp = (p.raw_payload as Record<string, unknown> | null) ?? {};
            if (!rp.dryRun) continue;
            rp.simulateReadyAt = new Date(Date.now() - 1000).toISOString();
            await supabaseAdmin
              .from("provider_orders")
              .update({ raw_payload: rp as never, created_at: new Date(Date.now() - 25_000).toISOString() })
              .eq("id", p.id);
            updated++;
          }
          return Response.json({ phase, updated });
        }

        if (phase === "backfill") {
          // Reimplementa inline: itera pending dryRun + idade ≥20s, materializa proxies fake
          const { generateSimulatedProxies, psDateToIso } = await import("@/lib/proxyseller.server");
          const cutoff = new Date(Date.now() - 20_000).toISOString();
          const { data: pending } = await supabaseAdmin
            .from("provider_orders")
            .select("id, product_id, raw_payload, triggered_by_order_id, country_code")
            .eq("status", "pending")
            .lte("created_at", cutoff);
          const log: Array<Record<string, unknown>> = [];
          for (const po of pending ?? []) {
            const rp = (po.raw_payload as Record<string, unknown> | null) ?? {};
            if (!rp.dryRun) {
              log.push({ id: po.id, skipped: "not dry-run" });
              continue;
            }
            const readyAt = rp.simulateReadyAt as string | undefined;
            if (readyAt && new Date(readyAt) > new Date()) {
              log.push({ id: po.id, skipped: "not ready yet", readyAt });
              continue;
            }
            const qty = (rp.quantityRequested as number) ?? 1;
            const base = rp.baseOrderNumber as string;
            const proxies = generateSimulatedProxies(base, qty, po.country_code ?? null);
            if (!po.product_id) {
              log.push({ id: po.id, skipped: "no product_id" });
              continue;
            }
            const productId = po.product_id;
            const stockRows = proxies.map((p) => ({
              product_id: productId,
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
            const ins = await supabaseAdmin.from("proxy_stock").insert(stockRows);
            await supabaseAdmin
              .from("provider_orders")
              .update({ status: "active", quantity: proxies.length })
              .eq("id", po.id);
            log.push({ id: po.id, materialized: proxies.length, ins_error: ins.error?.message });
            if (po.triggered_by_order_id) {
              try {
                const r = await allocateProxiesForOrder(po.triggered_by_order_id);
                log.push({ allocated_for: po.triggered_by_order_id, ...r });
              } catch (e) {
                log.push({ allocate_error: e instanceof Error ? e.message : String(e) });
              }
            }
          }
          return Response.json({ phase, log, snapshot: await snapshot() });
        }

        if (phase === "report") {
          return Response.json({ phase, snapshot: await snapshot() });
        }

        if (phase === "cleanup") {
          // Apaga customer_proxies de teste
          await supabaseAdmin.from("customer_proxies").delete().in("order_id", TEST_ORDER_IDS);
          // Apaga proxy_stock criado por dry-run + IPs fake
          await supabaseAdmin
            .from("proxy_stock")
            .delete()
            .or("external_proxy_id.like.DRYRUN-%,external_proxy_id.like.E2E-%");
          // Apaga provider_orders dry-run
          await supabaseAdmin
            .from("provider_orders")
            .delete()
            .like("external_order_id", "DRYRUN-%");
          // Apaga orders sintéticos
          await supabaseAdmin.from("orders").delete().in("id", TEST_ORDER_IDS);
          // Reverte estoque IPv6 que estava em hold
          await supabaseAdmin.rpc("e2e_unhold");
          // Plan B: update direto se RPC não existir
          const { data: held } = await supabaseAdmin
            .from("proxy_stock")
            .select("id, username")
            .like("username", "%__E2E_HOLD__%");
          for (const h of held ?? []) {
            const cleaned = (h.username as string).replace(" __E2E_HOLD__", "").trim();
            await supabaseAdmin
              .from("proxy_stock")
              .update({ status: "available", username: cleaned || null })
              .eq("id", h.id);
          }
          // Desliga dry-run
          await supabaseAdmin
            .from("provider_settings")
            .update({ dry_run: false })
            .eq("provider", "proxyseller");
          // Limpa purchase_locks de teste
          await supabaseAdmin.from("purchase_locks").delete().like("locked_by", "11111111-%");
          return Response.json({ phase, ok: true, snapshot: await snapshot() });
        }

        return Response.json({ error: "unknown phase" }, { status: 400 });
      },
    },
  },
});
