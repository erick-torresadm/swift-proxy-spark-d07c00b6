/**
 * Cron job ProxySeller — roda 1×/hora ou diário.
 *
 * Faz:
 *  1. Atualiza cotação USD→BRL (cache fresco)
 *  2. Snapshot do saldo da conta ProxySeller (USD)
 *  3. Restock preventivo: para cada produto com regra ativa, se
 *     stock < min_stock e auto_purchase_enabled → compra batch_quantity
 *  4. Health monitoring: detecta IPs expirando ≤3 dias e cria evento
 *
 * Auth: header `apikey` deve bater com SUPABASE_PUBLISHABLE_KEY
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { getBalance, purchaseIpv6Block, psDateToIso, safe } from "@/lib/proxyseller.server";
import { getUsdBrl } from "@/lib/fx.server";
import { notifyAllAdmins } from "@/lib/notifications.server";
import { checkCronAuth } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/proxyseller-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;

        const summary = {
          fx: null as { rate: number; source: string } | null,
          balance_usd: null as number | null,
          balance_low: false,
          restocks: [] as Array<{ product: string; bought: number; cost_cents: number }>,
          health_events: 0,
          errors: [] as string[],
        };

        // 1) FX
        const fx = await safe(() => getUsdBrl());
        if (fx.ok) summary.fx = { rate: fx.data.rate, source: fx.data.source };
        else summary.errors.push(`fx: ${fx.error}`);

        // 2) Saldo
        const bal = await safe(() => getBalance());
        if (bal.ok) {
          const balanceUsd = Number(bal.data.summ ?? 0);
          summary.balance_usd = balanceUsd;
          await supabaseAdmin
            .from("provider_balance_snapshots")
            .insert({ provider: "proxyseller", balance_usd: balanceUsd });

          const { data: settings } = await supabaseAdmin
            .from("provider_settings")
            .select("min_balance_usd")
            .eq("provider", "proxyseller")
            .maybeSingle();
          const min = Number(settings?.min_balance_usd ?? 50);
          summary.balance_low = balanceUsd < min;
        } else {
          summary.errors.push(`balance: ${bal.error}`);
        }

        // 3) Restock preventivo (somente IPv6 por enquanto)
        const { data: settings } = await supabaseAdmin
          .from("provider_settings")
          .select("auto_purchase_enabled, min_balance_usd")
          .eq("provider", "proxyseller")
          .maybeSingle();

        const canBuy =
          settings?.auto_purchase_enabled !== false &&
          !summary.balance_low &&
          summary.balance_usd !== null;

        if (canBuy) {
          const { data: rules } = await supabaseAdmin
            .from("restock_rules")
            .select("min_stock, batch_quantity, product_id, products(id, name, slug, category, country_code, provider_tariff_id)")
            .eq("enabled", true);

          for (const rule of rules ?? []) {
            const product = (rule as any).products as {
              id: string;
              name: string;
              slug: string;
              category: string;
              country_code: string | null;
              provider_tariff_id: string | null;
            } | null;
            if (!product) continue;
            if (!product.category?.startsWith("ipv6")) continue;
            if (!product.provider_tariff_id) continue;

            const { count: avail } = await supabaseAdmin
              .from("proxy_stock")
              .select("*", { count: "exact", head: true })
              .eq("product_id", product.id)
              .eq("status", "available");

            if ((avail ?? 0) >= rule.min_stock) continue;

            // 🔔 Alerta admin: estoque abaixo do mínimo
            void notifyAllAdmins({
              title: "⚠️ Estoque abaixo do mínimo",
              body: `${product.name}: ${avail ?? 0} disponíveis (mín. ${rule.min_stock}). Comprando ${rule.batch_quantity} IPs…`,
              link: "/admin/inventory",
              metadata: { productId: product.id, available: avail ?? 0, min: rule.min_stock },
              dedupeKey: `stock-low:${product.id}:${new Date().toISOString().slice(0, 10)}`,
            });

            try {
              const cfg = JSON.parse(product.provider_tariff_id);
              const result = await purchaseIpv6Block({
                countryId: cfg.countryId,
                periodId: cfg.periodId,
                quantity: rule.batch_quantity,
              });

              const { data: provOrder } = await supabaseAdmin
                .from("provider_orders")
                .insert({
                  product_id: product.id,
                  external_order_id: result.externalOrderId,
                  status: "active",
                  quantity: result.proxies.length,
                  cost_cents: result.costCents,
                  country_code: product.country_code,
                  raw_payload: { baseOrderNumber: result.baseOrderNumber, source: "restock_cron" } as never,
                })
                .select("id")
                .maybeSingle();

              const stockRows = result.proxies.map((p) => ({
                product_id: product.id,
                provider_order_id: provOrder?.id ?? null,
                external_proxy_id: p.id,
                host: p.ip_only || p.ip,
                port: p.port_http,
                username: p.login,
                password: p.password,
                protocol: (p.protocol || "http").toLowerCase(),
                country_code: product.country_code,
                status: "available" as const,
                expires_at: psDateToIso(p.date_end),
              }));

              if (stockRows.length > 0) {
                await supabaseAdmin.from("proxy_stock").insert(stockRows);
              }

              summary.restocks.push({
                product: product.slug,
                bought: result.proxies.length,
                cost_cents: result.costCents,
              });

              // 🔔 Alerta admin: restock concluído
              void notifyAllAdmins({
                title: "📦 Estoque renovado",
                body: `${product.name}: +${result.proxies.length} IPs (US$ ${(result.costCents / 100).toFixed(2)}).`,
                link: "/admin/inventory",
                metadata: { productId: product.id, bought: result.proxies.length },
                dedupeKey: `restock-cron:${product.id}:${result.externalOrderId}`,
              });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              summary.errors.push(`restock ${product.slug}: ${msg}`);
              // 🔔 Alerta admin: falha no restock
              void notifyAllAdmins({
                title: "🛑 Falha no restock automático",
                body: `${product.name}: ${msg}`,
                link: "/admin/inventory",
                metadata: { productId: product.id, error: msg },
                dedupeKey: `restock-cron-fail:${product.id}:${new Date().toISOString().slice(0, 13)}`,
              });
            }
          }
        }

        // 4) Health monitoring — IPs expirando em ≤3 dias
        const threshold = new Date(Date.now() + 3 * 86400 * 1000).toISOString();
        const { data: expiring } = await supabaseAdmin
          .from("proxy_stock")
          .select("id, external_proxy_id, expires_at")
          .lte("expires_at", threshold)
          .gt("expires_at", new Date().toISOString())
          .in("status", ["allocated", "available"])
          .limit(500);

        for (const ip of expiring ?? []) {
          // já tem evento aberto pra esse IP?
          const { count } = await supabaseAdmin
            .from("proxy_health_events")
            .select("*", { count: "exact", head: true })
            .eq("stock_id", ip.id)
            .eq("event", "expiring_soon")
            .is("resolved_at", null);
          if ((count ?? 0) > 0) continue;

          await supabaseAdmin.from("proxy_health_events").insert({
            stock_id: ip.id,
            external_proxy_id: ip.external_proxy_id,
            event: "expiring_soon",
            details: { expires_at: ip.expires_at } as never,
          });
          summary.health_events++;
        }

        // IPs expirados → fecha evento + marca status
        const { data: expired } = await supabaseAdmin
          .from("proxy_stock")
          .select("id, external_proxy_id")
          .lt("expires_at", new Date().toISOString())
          .neq("status", "expired")
          .limit(500);

        for (const ip of expired ?? []) {
          await supabaseAdmin
            .from("proxy_stock")
            .update({ status: "expired" as never })
            .eq("id", ip.id);
          await supabaseAdmin.from("proxy_health_events").insert({
            stock_id: ip.id,
            external_proxy_id: ip.external_proxy_id,
            event: "expired",
            details: {} as never,
          });
          summary.health_events++;
        }

        await supabaseAdmin.from("audit_log").insert({
          action: "proxyseller.sync",
          source: "cron",
          status: summary.errors.length ? "error" : "ok",
          response: summary as never,
        });

        return Response.json({ ok: true, ...summary });
      },
    },
  },
});
