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
import { getBalance, purchaseIpv6Block, safe } from "@/lib/proxyseller.server";
import { insertProxiesToStock } from "@/lib/allocation.server";
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

          // ── Alerta escalonado de saldo ProxySeller ──
          // 3 níveis com dedupe cada vez mais curto → força o dono a recarregar.
          // Ao recarregar, o alerta some sozinho no próximo ciclo.
          let alertLevel: "critical" | "urgent" | "warning" | null = null;
          let dedupeBucketMs = 0;
          let title = "";
          if (balanceUsd < 2) {
            alertLevel = "critical";
            dedupeBucketMs = 30 * 60_000; // 30 min
            title = `🚨 SALDO ProxySeller CRÍTICO — US$ ${balanceUsd.toFixed(2)} — RECARREGUE AGORA`;
          } else if (balanceUsd < min / 2) {
            alertLevel = "urgent";
            dedupeBucketMs = 2 * 60 * 60_000; // 2h
            title = `⚠️ Saldo ProxySeller BAIXO — US$ ${balanceUsd.toFixed(2)}`;
          } else if (balanceUsd < min) {
            alertLevel = "warning";
            dedupeBucketMs = 6 * 60 * 60_000; // 6h
            title = `💰 Saldo ProxySeller em atenção — US$ ${balanceUsd.toFixed(2)}`;
          }
          if (alertLevel) {
            void notifyAllAdmins({
              title,
              body:
                alertLevel === "critical"
                  ? `Saldo insuficiente para o próximo bloco IPv6 (~US$ 1,26). Pedidos pagos vão FALHAR até você recarregar. Mín. recomendado US$ ${min}. Recarregue em proxy-seller.com/personal/balance. Alerta se repete a cada 30 min.`
                  : alertLevel === "urgent"
                  ? `Saldo abaixo de US$ ${(min / 2).toFixed(0)} (metade do mínimo US$ ${min}). Recarregue em breve. Alerta se repete a cada 2h.`
                  : `Saldo abaixo de US$ ${min}. Recarregue quando puder. Alerta se repete a cada 6h.`,
              link: "/admin/inventory",
              metadata: { balanceUsd, min, level: alertLevel } as never,
              dedupeKey: `provider-balance-${alertLevel}:${Math.floor(Date.now() / dedupeBucketMs)}`,
            });
          }
        } else {
          summary.errors.push(`balance: ${bal.error}`);
          void notifyAllAdmins({
            title: "🛑 Não consegui checar saldo ProxySeller — AÇÃO NECESSÁRIA",
            body: `Erro: ${bal.error}. Alerta se repete a cada hora até resolver.`,
            link: "/admin/inventory",
            metadata: { error: bal.error } as never,
            dedupeKey: `provider-balance-check-fail:${Math.floor(Date.now() / 3600000)}`,
          });
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

            // Antes de comprar, há pedido pendente recente no provedor? Se sim,
            // pula — o backfill vai materializar e completar o estoque.
            const recentCutoff = new Date(Date.now() - 20 * 60_000).toISOString();
            const { count: openPending } = await supabaseAdmin
              .from("provider_orders")
              .select("*", { count: "exact", head: true })
              .eq("product_id", product.id)
              .eq("status", "pending")
              .gte("created_at", recentCutoff);
            if ((openPending ?? 0) > 0) continue;

            // Compra só a diferença necessária para voltar ao mínimo,
            // limitada ao batch_quantity. Nunca mais do que faltar.
            const deficit = rule.min_stock - (avail ?? 0);
            const toBuy = Math.min(deficit, rule.batch_quantity);
            if (toBuy <= 0) continue;

            // 🔔 Alerta admin: estoque abaixo do mínimo
            void notifyAllAdmins({
              title: "⚠️ Estoque abaixo do mínimo",
              body: `${product.name}: ${avail ?? 0} disponíveis (mín. ${rule.min_stock}). Comprando ${toBuy} IPs…`,
              link: "/admin/inventory",
              metadata: { productId: product.id, available: avail ?? 0, min: rule.min_stock, to_buy: toBuy },
              dedupeKey: `stock-low:${product.id}:${new Date().toISOString().slice(0, 10)}`,
            });

            try {
              const cfg = JSON.parse(product.provider_tariff_id);
              const result = await purchaseIpv6Block({
                countryId: cfg.countryId,
                periodId: cfg.periodId,
                quantity: toBuy,
              });

              // Se o /proxy/list ainda não devolveu IPs (ProxySeller leva
              // ~5 min para provisionar), gravamos como `pending` com o
              // baseOrderNumber — o cron de backfill completa depois.
              const isReady = result.proxies.length > 0;
              const { data: provOrder } = await supabaseAdmin
                .from("provider_orders")
                .insert({
                  product_id: product.id,
                  external_order_id: result.externalOrderId,
                  status: isReady ? "active" : "pending",
                  quantity: isReady ? result.proxies.length : toBuy,
                  cost_cents: result.costCents,
                  country_code: product.country_code,
                  raw_payload: {
                    baseOrderNumber: result.baseOrderNumber,
                    source: "restock_cron",
                    quantityRequested: toBuy,
                  } as never,
                })
                .select("id")
                .maybeSingle();

              const added = await insertProxiesToStock(
                { id: product.id, country_code: product.country_code },
                provOrder?.id ?? null,
                result.proxies,
              );

              summary.restocks.push({
                product: product.slug,
                bought: added,
                cost_cents: result.costCents,
              });

              // 🔔 Alerta admin: restock concluído
              void notifyAllAdmins({
                title: "📦 Estoque renovado",
                body: `${product.name}: +${added} IPs (US$ ${(result.costCents / 100).toFixed(2)}).`,
                link: "/admin/inventory",
                metadata: { productId: product.id, bought: added },
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
