/**
 * TEMPORARY end-to-end backend simulation endpoint.
 * - Cria 1 pedido pago para cada produto ativo (user_id = admin do projeto)
 * - Roda allocateProxiesForOrder
 * - Encurta o delay de dry-run (simulateReadyAt = passado)
 * - Roda backfill duas vezes
 * - Retorna diagnóstico completo
 *
 * Protegido pelo apikey (mesmo padrão dos crons).
 * DELETAR após validação.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { allocateProxiesForOrder } from "@/lib/allocation.server";
import { checkCronAuth } from "@/lib/cron-auth.server";
import { pollProxiesForOrder, psDateToIso, generateSimulatedProxies } from "@/lib/proxyseller.server";

const TEST_USER_ID = "dfa4c17a-509c-45eb-a401-180163ee1e5d"; // ericktorresadm@hotmail.com

export const Route = createFileRoute("/api/public/_test/run-simulation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;

        const log: Record<string, unknown>[] = [];

        // 1) Force dry_run
        await supabaseAdmin
          .from("provider_settings")
          .update({ dry_run: true })
          .eq("provider", "proxyseller");

        // 2) Load all active products
        const { data: products } = await supabaseAdmin
          .from("products")
          .select("id, slug, name, category, country_code, delivery_mode, price_monthly_cents, block_size")
          .eq("active", true)
          .order("slug");

        const productList = products ?? [];

        // 3) For each product, create a paid order and try to allocate
        const createdOrderIds: string[] = [];
        for (const p of productList) {
          const now = new Date();
          const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

          const { data: order, error: orderErr } = await supabaseAdmin
            .from("orders")
            .insert({
              user_id: TEST_USER_ID,
              product_id: p.id,
              quantity: 1,
              status: "paid",
              billing: "monthly",
              amount_cents: p.price_monthly_cents,
              subtotal_cents: p.price_monthly_cents,
              currency: "BRL",
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
              metadata: { test_simulation: true } as never,
            })
            .select("id")
            .maybeSingle();

          if (orderErr || !order) {
            log.push({ step: "create_order", product: p.slug, error: orderErr?.message });
            continue;
          }

          createdOrderIds.push(order.id);

          try {
            const r = await allocateProxiesForOrder(order.id);
            log.push({
              step: "allocate_initial",
              product: p.slug,
              delivery_mode: p.delivery_mode,
              order_id: order.id,
              ...r,
            });
          } catch (e) {
            log.push({
              step: "allocate_initial",
              product: p.slug,
              order_id: order.id,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // 4) Short-circuit dry-run delay: set simulateReadyAt to past for all
        //    pending provider_orders triggered by the test orders.
        if (createdOrderIds.length > 0) {
          const { data: pending } = await supabaseAdmin
            .from("provider_orders")
            .select("id, raw_payload, triggered_by_order_id")
            .in("triggered_by_order_id", createdOrderIds)
            .eq("status", "pending");

          for (const po of pending ?? []) {
            const payload = (po.raw_payload as Record<string, unknown> | null) ?? {};
            payload.simulateReadyAt = new Date(Date.now() - 1000).toISOString();
            await supabaseAdmin
              .from("provider_orders")
              .update({ raw_payload: payload as never })
              .eq("id", po.id);
          }
          log.push({ step: "shortcircuit_dry_run", patched: pending?.length ?? 0 });
        }

        // 5) Inline backfill — materialize the dry-run IPs and re-allocate
        const { data: pending2 } = await supabaseAdmin
          .from("provider_orders")
          .select("id, product_id, raw_payload, triggered_by_order_id, country_code")
          .in("triggered_by_order_id", createdOrderIds)
          .eq("status", "pending");

        for (const po of pending2 ?? []) {
          const payload = po.raw_payload as {
            baseOrderNumber?: string;
            dryRun?: boolean;
            kind?: "ipv6" | "ipv4" | "isp" | "mobile";
            simulateReadyAt?: string;
            quantityRequested?: number;
          } | null;
          const baseOrderNumber = payload?.baseOrderNumber;
          if (!baseOrderNumber || !po.product_id) continue;

          const { data: prod } = await supabaseAdmin
            .from("products")
            .select("category")
            .eq("id", po.product_id)
            .maybeSingle();

          let kind: "ipv6" | "ipv4" | "isp" | "mobile" = payload?.kind ?? "ipv6";
          const cat = prod?.category as string | undefined;
          if (!payload?.kind) {
            if (cat === "ipv4") kind = "ipv4";
            else if (cat === "isp") kind = "isp";
            else kind = "ipv6";
          }

          let proxies;
          if (payload?.dryRun) {
            const qty = payload.quantityRequested || 1;
            proxies = generateSimulatedProxies(baseOrderNumber, qty, po.country_code);
          } else {
            proxies = await pollProxiesForOrder(baseOrderNumber, 1, [0], kind);
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

          await supabaseAdmin.from("proxy_stock").insert(stockRows);
          await supabaseAdmin
            .from("provider_orders")
            .update({ status: "active", quantity: stockRows.length })
            .eq("id", po.id);

          if (po.triggered_by_order_id) {
            try {
              const r = await allocateProxiesForOrder(po.triggered_by_order_id);
              log.push({
                step: "allocate_after_backfill",
                provider_order_id: po.id,
                order_id: po.triggered_by_order_id,
                added_to_stock: stockRows.length,
                ...r,
              });
            } catch (e) {
              log.push({
                step: "allocate_after_backfill",
                order_id: po.triggered_by_order_id,
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }
        }

        // 6) Final state per test order
        const finalState: Array<Record<string, unknown>> = [];
        for (const oid of createdOrderIds) {
          const { data: o } = await supabaseAdmin
            .from("orders")
            .select("id, status, product_id, products(slug, delivery_mode)")
            .eq("id", oid)
            .maybeSingle();
          const { count: proxyCount } = await supabaseAdmin
            .from("customer_proxies")
            .select("*", { count: "exact", head: true })
            .eq("order_id", oid)
            .neq("status", "released");
          finalState.push({
            order_id: oid,
            product: (o as { products?: { slug?: string } } | null)?.products?.slug,
            delivery_mode: (o as { products?: { delivery_mode?: string } } | null)?.products?.delivery_mode,
            order_status: (o as { status?: string } | null)?.status,
            proxies_allocated: proxyCount ?? 0,
          });
        }

        // 7) Restore dry_run=false so production isn't accidentally left in dry-run
        await supabaseAdmin
          .from("provider_settings")
          .update({ dry_run: false })
          .eq("provider", "proxyseller");

        return Response.json({
          ok: true,
          test_user: TEST_USER_ID,
          products_tested: productList.length,
          orders_created: createdOrderIds,
          log,
          final_state: finalState,
        });
      },
    },
  },
});
