/**
 * TEST-ONLY endpoint: simula uma compra completa (sem Stripe) e força a
 * alocação de proxies. Usa dry_run da ProxySeller pra IPv6 — sem queimar saldo.
 *
 * Auth: header `apikey` deve bater com SUPABASE_PUBLISHABLE_KEY.
 *
 * Body JSON:
 * {
 *   "productSlug": "ipv6-br",
 *   "userId": "uuid",
 *   "quantity": 1,
 *   "fastForward": true   // se true, antecipa simulateReadyAt e roda backfill
 * }
 *
 * Retorna o pedido criado, resultado da alocação e contagem de IPs finais.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { allocateProxiesForOrder } from "@/lib/allocation.server";
import { generateSimulatedProxies, psDateToIso } from "@/lib/proxyseller.server";

export const Route = createFileRoute("/api/public/hooks/simulate-purchase")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: {
          productSlug?: string;
          userId?: string;
          quantity?: number;
          fastForward?: boolean;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
        }

        const { productSlug, userId, quantity = 1, fastForward = true } = body;
        if (!productSlug || !userId) {
          return Response.json(
            { ok: false, error: "productSlug and userId required" },
            { status: 400 },
          );
        }

        const { data: product } = await supabaseAdmin
          .from("products")
          .select("id, name, slug, category, country_code, price_monthly_cents, block_size")
          .eq("slug", productSlug)
          .maybeSingle();
        if (!product) {
          return Response.json({ ok: false, error: "product not found" }, { status: 404 });
        }

        // 1) Cria pedido já PAGO (bypass Stripe)
        const amount = product.price_monthly_cents * quantity;
        const { data: order, error: orderErr } = await supabaseAdmin
          .from("orders")
          .insert({
            user_id: userId,
            product_id: product.id,
            quantity,
            amount_cents: amount,
            billing_cycle: "monthly",
            status: "paid",
            customer_email: "simulate@test.local",
            customer_name: "SIM Test",
            current_period_end: new Date(Date.now() + 30 * 86400_000).toISOString(),
            stripe_checkout_session_id: `SIM-${Date.now()}`,
          })
          .select("id")
          .maybeSingle();
        if (orderErr || !order) {
          return Response.json(
            { ok: false, error: `order insert failed: ${orderErr?.message}` },
            { status: 500 },
          );
        }

        // 2) Aloca
        const allocResult = await allocateProxiesForOrder(order.id);

        // 3) Fast-forward: se ficou pendente em dry_run, materializa IPs agora
        let backfillRecovered = 0;
        if (fastForward && allocResult.pending) {
          // antecipa simulateReadyAt das provider_orders criadas pra este pedido
          const { data: pending } = await supabaseAdmin
            .from("provider_orders")
            .select("id, raw_payload, product_id, country_code")
            .eq("triggered_by_order_id", order.id)
            .eq("status", "pending");

          for (const po of pending ?? []) {
            const payload = po.raw_payload as {
              baseOrderNumber?: string;
              dryRun?: boolean;
              quantityRequested?: number;
            } | null;
            if (!payload?.dryRun || !payload.baseOrderNumber) continue;

            const qty = payload.quantityRequested || 1;
            const proxies = generateSimulatedProxies(
              payload.baseOrderNumber,
              qty,
              po.country_code,
            );
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
            if (insErr) continue;
            await supabaseAdmin
              .from("provider_orders")
              .update({ status: "active", quantity: stockRows.length })
              .eq("id", po.id);
            backfillRecovered += stockRows.length;
          }

          // Re-aloca agora que tem estoque
          if (backfillRecovered > 0) {
            const second = await allocateProxiesForOrder(order.id);
            allocResult.allocated = second.allocated;
            allocResult.short = second.short;
            allocResult.pending = second.pending;
          }
        }

        // 4) Lista IPs efetivamente entregues ao cliente
        const { data: delivered } = await supabaseAdmin
          .from("customer_proxies")
          .select("id, status, proxy_stock(host, port, username, country_code, protocol)")
          .eq("order_id", order.id);

        return Response.json({
          ok: true,
          orderId: order.id,
          product: { slug: product.slug, category: product.category, block_size: product.block_size },
          quantityRequested: quantity,
          expectedIps: quantity * (product.block_size ?? 1),
          allocation: allocResult,
          backfillRecovered,
          deliveredCount: delivered?.length ?? 0,
          delivered: delivered ?? [],
        });
      },
    },
  },
});
