import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import {
  purchaseProxyBlock,
  pollProxiesForOrder,
  psDateToIso,
  calcOrder,
  generateSimulatedProxies,
  prolongMake,
  prolongCalc,
} from "./proxyseller.server";
import type { PsProxyItem, PsProxyKind } from "./proxyseller.server";
import { notifyAllAdmins } from "./notifications.server";

/** Map our product.category → ProxySeller "kind" used in /order/* and /proxy/list/{kind}. */
function categoryToKind(category: string | null | undefined): PsProxyKind {
  switch (category) {
    case "ipv4": return "ipv4";
    case "isp": return "isp";
    case "ipv6":
    case "ipv6_fb":
    default: return "ipv6";
  }
}

const PURCHASE_LOCK_TTL_MS = 90_000;
// ProxySeller IPv6 minimum purchase block size
const PROXYSELLER_IPV6_MIN_BLOCK = 10;
// ProxySeller leva ~5 min (às vezes mais) entre /order/make e o pedido
// aparecer no painel / /proxy/list. Mantemos uma janela ampla para reusar
// pedidos pendentes antes de gastar de novo.
const PENDING_REUSE_MAX_AGE_MS = 20 * 60_000;
const PENDING_BLOCK_NEW_BUY_MS = 20 * 60_000;
// Simulated provisioning delay range (mimics real ProxySeller 3-5min)
const DRY_RUN_DELAY_MIN_MS = 3 * 60_000;
const DRY_RUN_DELAY_MAX_MS = 5 * 60_000;

/**
 * Allocates proxies from stock to a paid order.
 * - quantityNeeded = order.quantity * product.block_size
 * - picks `available` proxy_stock rows matching the order's product
 * - For IPv6 categories: if stock is short, auto-purchase from ProxySeller
 *   (reuses freed stock first, only buys when truly empty)
 * - inserts into customer_proxies and flips stock status to `allocated`
 * Idempotent: if proxies are already allocated for this order, does nothing.
 */
export async function allocateProxiesForOrder(orderId: string): Promise<{
  allocated: number;
  short: number;
  error?: string;
  pending?: boolean;
}> {
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, product_id, quantity, status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) throw new Error(orderErr.message);
  if (!order) throw new Error("order not found");
  if (!order.user_id) throw new Error("order has no user_id yet");
  if (order.status !== "paid") {
    return { allocated: 0, short: 0 };
  }

  const { data: product } = await supabaseAdmin
    .from("products")
    .select("id, block_size, category, country_code, provider_tariff_id, delivery_mode, restock_threshold")
    .eq("id", order.product_id)
    .maybeSingle();
  if (!product) throw new Error("product not found");

  const totalNeeded = order.quantity * (product.block_size ?? 1);

  // Already allocated for this order?
  const { count: existing } = await supabaseAdmin
    .from("customer_proxies")
    .select("*", { count: "exact", head: true })
    .eq("order_id", order.id)
    .neq("status", "released");

  if ((existing ?? 0) >= totalNeeded) {
    return { allocated: existing ?? 0, short: 0 };
  }

  const remaining = totalNeeded - (existing ?? 0);

  // ───────── 1) Pick available stock first (reuse freed IPs) ─────────
  const { data: pool } = await supabaseAdmin
    .from("proxy_stock")
    .select("id")
    .eq("product_id", product.id)
    .eq("status", "available")
    .limit(remaining);

  let picks = pool ?? [];

  // ───────── 2) If short → try reuse pending, then auto-purchase from provider ─────────
  // Works for any product with a provider_tariff_id (IPv6/IPv6-FB → stock,
  // IPv4/ISP → direct on-demand. Direct products typically have no stock, so
  // every paid order triggers a provider purchase here.)
  const canAutoPurchase = !!product.provider_tariff_id;
  const stillShort = remaining - picks.length;

  let purchaseError: string | undefined;
  let pendingInFlight = false;
  if (stillShort > 0 && isIpv6) {
    // 2a) Reuse recent pending provider_orders before spending more money
    const reused = await tryFulfillFromPendingOrders(product, order.id);
    if (reused > 0) {
      const { data: pool2 } = await supabaseAdmin
        .from("proxy_stock")
        .select("id")
        .eq("product_id", product.id)
        .eq("status", "available")
        .limit(remaining);
      picks = pool2 ?? [];
    }

    const stillShortAfterReuse = remaining - picks.length;
    if (stillShortAfterReuse > 0) {
      // 2b) Já existe pedido pendente recente do provedor? Se sim, NÃO compra
      //     de novo — o backfill ou a próxima alocação resolve.
      const cutoff = new Date(Date.now() - PENDING_BLOCK_NEW_BUY_MS).toISOString();
      const { count: openPending } = await supabaseAdmin
        .from("provider_orders")
        .select("*", { count: "exact", head: true })
        .eq("product_id", product.id)
        .eq("status", "pending")
        .gte("created_at", cutoff);

      if ((openPending ?? 0) > 0) {
        pendingInFlight = true;
      } else {
        // 2c) Acquire purchase lock (prevents duplicate concurrent buys)
        const lockOk = await tryAcquirePurchaseLock(product.id, order.id);
        if (!lockOk) {
          pendingInFlight = true;
        } else {
          void notifyAllAdmins({
            title: "⚠️ Estoque insuficiente",
            body: `Pedido ${order.id.slice(0, 8)} precisa de ${remaining} IPs do produto ${product.category}/${product.country_code ?? "?"}. Faltam ${stillShortAfterReuse}. Comprando bloco na ProxySeller…`,
            link: "/admin/inventory",
            metadata: { orderId: order.id, productId: product.id, shortBy: stillShortAfterReuse },
            dedupeKey: `stock-short:${order.id}`,
          });

          try {
            const bought = await autoPurchaseIpv6IntoStock(product, stillShortAfterReuse, order.id);
            if (bought > 0) {
              void notifyAllAdmins({
                title: "📦 Estoque renovado",
                body: `+${bought} IPs adicionados ao produto ${product.category}/${product.country_code ?? "?"} via compra automática.`,
                link: "/admin/inventory",
                metadata: { productId: product.id, added: bought },
                dedupeKey: `restock-auto:${order.id}`,
              });
              const { data: pool3 } = await supabaseAdmin
                .from("proxy_stock")
                .select("id")
                .eq("product_id", product.id)
                .eq("status", "available")
                .limit(remaining);
              picks = pool3 ?? [];
            } else {
              // bought=0 means provider order placed but IPs not yet ready → backfill will finish
              pendingInFlight = true;
            }
          } catch (e) {
            purchaseError = e instanceof Error ? e.message : String(e);
            console.error("[allocation] auto-purchase IPv6 failed:", e);
            void notifyAllAdmins({
              title: "🛑 Falha na compra automática",
              body: `ProxySeller falhou ao comprar IPs para ${product.category}/${product.country_code ?? "?"}: ${purchaseError}`,
              link: "/admin/inventory",
              metadata: { orderId: order.id, productId: product.id, error: purchaseError },
              dedupeKey: `restock-fail:${order.id}`,
            });
          } finally {
            await releasePurchaseLock(product.id);
          }
        }
      }
    }
  }

  if (picks.length === 0) {
    return {
      allocated: existing ?? 0,
      short: remaining,
      error: purchaseError,
      pending: pendingInFlight,
    };
  }

  // Insert allocations
  const rows = picks.map((p) => ({
    user_id: order.user_id as string,
    order_id: order.id,
    stock_id: p.id,
    status: "active" as const,
  }));

  const { error: insErr } = await supabaseAdmin.from("customer_proxies").insert(rows);
  if (insErr) throw new Error(insErr.message);

  // Flip stock to allocated
  const ids = picks.map((p) => p.id);
  await supabaseAdmin.from("proxy_stock").update({ status: "allocated" }).in("id", ids);

  return {
    allocated: (existing ?? 0) + picks.length,
    short: remaining - picks.length,
    error: purchaseError,
  };
}

/**
 * Buys an IPv6 block from ProxySeller and inserts the proxies into stock.
 * Reads ProxySeller config from product.provider_tariff_id as JSON:
 *   { "countryId": 20554, "periodId": "1m" }
 */
async function autoPurchaseIpv6IntoStock(
  product: {
    id: string;
    provider_tariff_id: string | null;
    country_code: string | null;
  },
  needed: number,
  triggeredByOrderId: string,
): Promise<number> {
  if (!product.provider_tariff_id) {
    throw new Error(`product ${product.id} missing provider_tariff_id (ProxySeller config)`);
  }

  // ProxySeller requires minimum block of 10 for IPv6
  const quantityToBuy = Math.max(needed, PROXYSELLER_IPV6_MIN_BLOCK);

  let cfg: {
    countryId?: number;
    periodId?: string;
    protocol?: "HTTPS" | "SOCKS5";
    targetSectionId?: number;
    targetId?: number;
  };
  try {
    cfg = JSON.parse(product.provider_tariff_id);
  } catch {
    throw new Error("invalid provider_tariff_id JSON");
  }
  if (!cfg.countryId || !cfg.periodId) {
    throw new Error("provider_tariff_id must include {countryId, periodId}");
  }

  // Check dry-run mode — simulate full purchase flow without spending balance
  const { data: settings } = await supabaseAdmin
    .from("provider_settings")
    .select("dry_run")
    .eq("provider", "proxyseller")
    .maybeSingle();
  const dryRun = !!(settings as { dry_run?: boolean } | null)?.dry_run;

  if (dryRun) {
    // 1) Real /order/calc call (validates country/period/qty, no charge)
    const calc = await calcOrder("ipv6", {
      countryId: cfg.countryId,
      periodId: cfg.periodId,
      quantity: quantityToBuy,
      protocol: cfg.protocol,
      targetSectionId: cfg.targetSectionId,
      targetId: cfg.targetId,
    });
    const costCents = Math.round((Number(calc.total) || 0) * 100);
    const delay =
      DRY_RUN_DELAY_MIN_MS +
      Math.floor(Math.random() * (DRY_RUN_DELAY_MAX_MS - DRY_RUN_DELAY_MIN_MS));
    const simulateReadyAt = new Date(Date.now() + delay).toISOString();
    const fakeBase = `DRYRUN-${crypto.randomUUID()}`;

    await supabaseAdmin.from("provider_orders").insert({
      product_id: product.id,
      external_order_id: fakeBase,
      status: "pending",
      quantity: 0,
      cost_cents: costCents,
      country_code: product.country_code,
      triggered_by_order_id: triggeredByOrderId,
      raw_payload: {
        baseOrderNumber: fakeBase,
        dryRun: true,
        simulateReadyAt,
        quantityRequested: quantityToBuy,
        periodId: cfg.periodId,
        countryId: cfg.countryId,
      } as never,
    });

    // Returns 0 — backfill cron will materialize fake IPs after delay,
    // mimicking the real 3-5min ProxySeller provisioning window.
    return 0;
  }

  const result = await purchaseIpv6Block({
    countryId: cfg.countryId,
    periodId: cfg.periodId,
    quantity: quantityToBuy,
    protocol: cfg.protocol,
    targetSectionId: cfg.targetSectionId,
    targetId: cfg.targetId,
  });

  const isReady = result.proxies.length > 0;

  const { data: provOrder } = await supabaseAdmin
    .from("provider_orders")
    .insert({
      product_id: product.id,
      external_order_id: result.externalOrderId,
      status: isReady ? "active" : "pending",
      quantity: result.proxies.length,
      cost_cents: result.costCents,
      country_code: product.country_code,
      triggered_by_order_id: triggeredByOrderId,
      raw_payload: { baseOrderNumber: result.baseOrderNumber } as never,
    })
    .select("id")
    .maybeSingle();

  if (!isReady) return 0;

  return await insertProxiesToStock(product, provOrder?.id ?? null, result.proxies);
}

async function insertProxiesToStock(
  product: { id: string; country_code: string | null },
  providerOrderId: string | null,
  proxies: PsProxyItem[],
): Promise<number> {
  const stockRows = proxies.map((p) => ({
    product_id: product.id,
    provider_order_id: providerOrderId,
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

  if (stockRows.length === 0) return 0;
  const { error: stockErr } = await supabaseAdmin.from("proxy_stock").insert(stockRows);
  if (stockErr) throw new Error(`stock insert failed: ${stockErr.message}`);
  return stockRows.length;
}

/**
 * Try to recover IPs from a previously-placed provider order that returned no
 * proxies yet (race between /order/make and ProxySeller provisioning).
 * Returns number of IPs newly added to stock.
 */
async function tryFulfillFromPendingOrders(
  product: { id: string; country_code: string | null },
  triggeredByOrderId: string,
): Promise<number> {
  const cutoff = new Date(Date.now() - PENDING_REUSE_MAX_AGE_MS).toISOString();
  const { data: pending } = await supabaseAdmin
    .from("provider_orders")
    .select("id, raw_payload, quantity")
    .eq("product_id", product.id)
    .eq("status", "pending")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true });

  if (!pending?.length) return 0;

  let total = 0;
  for (const po of pending) {
    const payload = (po.raw_payload as { baseOrderNumber?: string; dryRun?: boolean; simulateReadyAt?: string; quantityRequested?: number } | null);
    const baseOrderNumber = payload?.baseOrderNumber;
    if (!baseOrderNumber) continue;

    let proxies: PsProxyItem[] = [];
    if (payload?.dryRun) {
      if (!payload.simulateReadyAt || new Date(payload.simulateReadyAt) > new Date()) continue;
      const qty = payload.quantityRequested || po.quantity || 1;
      proxies = generateSimulatedProxies(baseOrderNumber, qty, product.country_code);
    } else {
      proxies = await pollProxiesForOrder(baseOrderNumber, 1, [500, 1500]);
    }
    if (proxies.length === 0) continue;

    const added = await insertProxiesToStock(product, po.id, proxies);
    if (added > 0) {
      await supabaseAdmin
        .from("provider_orders")
        .update({
          status: "active",
          quantity: added,
          triggered_by_order_id: triggeredByOrderId,
        })
        .eq("id", po.id);
      total += added;
    }
  }
  return total;
}

async function tryAcquirePurchaseLock(productId: string, lockedBy: string): Promise<boolean> {
  const now = new Date();
  const until = new Date(now.getTime() + PURCHASE_LOCK_TTL_MS);

  // Try insert first (fast path)
  const ins = await supabaseAdmin.from("purchase_locks").insert({
    product_id: productId,
    locked_until: until.toISOString(),
    locked_by: lockedBy,
  });
  if (!ins.error) return true;

  // Existing lock — check if expired
  const { data: existing } = await supabaseAdmin
    .from("purchase_locks")
    .select("locked_until")
    .eq("product_id", productId)
    .maybeSingle();
  if (existing && new Date(existing.locked_until) > now) {
    return false; // still locked
  }
  // Expired — steal it
  const upd = await supabaseAdmin
    .from("purchase_locks")
    .update({ locked_until: until.toISOString(), locked_by: lockedBy })
    .eq("product_id", productId)
    .lt("locked_until", now.toISOString());
  return !upd.error;
}

async function releasePurchaseLock(productId: string): Promise<void> {
  await supabaseAdmin.from("purchase_locks").delete().eq("product_id", productId);
}


/**
 * Renova (prolong) os blocos do provedor que contêm os proxies ativos do pedido.
 *
 * Regra de blocos (ProxySeller IPv6 mínimo = 10):
 *  - cada `provider_orders` representa 1 bloco (≥10 IPs)
 *  - renovamos TODOS os IPs do(s) bloco(s) que contêm allocations ativas do cliente
 *  - se o cliente tem 10 ativos em 1 bloco → renova 10
 *  - se tem 11 ativos espalhados em 2 blocos → renova 20 (os 9 extras ficam como estoque livre renovado)
 *
 * Idempotente o suficiente: chamado a cada `invoice.payment_succeeded` de renovação.
 * Em `dry_run`, apenas calcula custo e atualiza expires_at localmente.
 */
export async function renewProxyBlocksForOrder(orderId: string): Promise<{
  renewed_proxies: number;
  renewed_blocks: number;
  cost_usd: number;
  dry_run: boolean;
  skipped_reason?: string;
}> {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, product_id, current_period_end")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { renewed_proxies: 0, renewed_blocks: 0, cost_usd: 0, dry_run: false, skipped_reason: "order not found" };

  const { data: product } = await supabaseAdmin
    .from("products")
    .select("id, category, provider_tariff_id")
    .eq("id", order.product_id)
    .maybeSingle();
  if (!product) return { renewed_proxies: 0, renewed_blocks: 0, cost_usd: 0, dry_run: false, skipped_reason: "product not found" };

  const isIpv6 = product.category === "ipv6" || product.category === "ipv6_fb";
  if (!isIpv6) {
    return { renewed_proxies: 0, renewed_blocks: 0, cost_usd: 0, dry_run: false, skipped_reason: `category ${product.category} not auto-renewable yet` };
  }
  if (!product.provider_tariff_id) {
    return { renewed_proxies: 0, renewed_blocks: 0, cost_usd: 0, dry_run: false, skipped_reason: "product missing provider_tariff_id" };
  }
  let cfg: { periodId?: string };
  try { cfg = JSON.parse(product.provider_tariff_id); } catch { cfg = {}; }
  if (!cfg.periodId) {
    return { renewed_proxies: 0, renewed_blocks: 0, cost_usd: 0, dry_run: false, skipped_reason: "provider_tariff_id missing periodId" };
  }

  // Blocos (provider_orders) que contêm os proxies ATIVOS deste pedido
  const { data: activeAllocs } = await supabaseAdmin
    .from("customer_proxies")
    .select("stock_id")
    .eq("order_id", orderId)
    .in("status", ["active", "grace"]);

  const stockIds = (activeAllocs ?? []).map((r) => r.stock_id).filter((x): x is string => !!x);
  if (stockIds.length === 0) {
    return { renewed_proxies: 0, renewed_blocks: 0, cost_usd: 0, dry_run: false, skipped_reason: "no active proxies" };
  }

  const { data: stockRows } = await supabaseAdmin
    .from("proxy_stock")
    .select("provider_order_id")
    .in("id", stockIds);
  const blockIds = Array.from(new Set((stockRows ?? []).map((r) => r.provider_order_id).filter((x): x is string => !!x)));
  if (blockIds.length === 0) {
    return { renewed_proxies: 0, renewed_blocks: 0, cost_usd: 0, dry_run: false, skipped_reason: "active proxies have no provider_order_id (legacy import)" };
  }

  // Todos os IPs (alocados + livres) que pertencem a esses blocos
  const { data: blockStock } = await supabaseAdmin
    .from("proxy_stock")
    .select("id, external_proxy_id")
    .in("provider_order_id", blockIds);
  const externalIds = (blockStock ?? [])
    .map((r) => r.external_proxy_id)
    .filter((x): x is string => !!x);
  if (externalIds.length === 0) {
    return { renewed_proxies: 0, renewed_blocks: blockIds.length, cost_usd: 0, dry_run: false, skipped_reason: "no external_proxy_id (dry-run/sim block)" };
  }

  const kind: PsProxyKind = "ipv6";
  const { data: settings } = await supabaseAdmin
    .from("provider_settings")
    .select("dry_run")
    .eq("provider", "proxyseller")
    .maybeSingle();
  const dryRun = !!(settings as { dry_run?: boolean } | null)?.dry_run;

  let costUsd = 0;
  if (dryRun) {
    const calc = await prolongCalc(kind, { ids: externalIds, periodId: cfg.periodId });
    costUsd = Number(calc.total) || 0;
  } else {
    const result = await prolongMake(kind, { ids: externalIds, periodId: cfg.periodId });
    costUsd = Number(result.total) || 0;
  }

  // Estende expires_at local em 30 dias (período mensal padrão) — o sync do provedor reconcilia depois
  const newExpiry = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const stockIdAll = (blockStock ?? []).map((r) => r.id);
  if (stockIdAll.length > 0) {
    await supabaseAdmin
      .from("proxy_stock")
      .update({ expires_at: newExpiry })
      .in("id", stockIdAll);
  }

  // Marca pedidos do provedor como renovados (para auditoria)
  await supabaseAdmin
    .from("provider_orders")
    .update({ purchased_at: new Date().toISOString(), expires_at: newExpiry })
    .in("id", blockIds);

  return {
    renewed_proxies: externalIds.length,
    renewed_blocks: blockIds.length,
    cost_usd: costUsd,
    dry_run: dryRun,
  };
}
