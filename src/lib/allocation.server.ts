import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import {
  purchaseProxyBlock,
  pollProxiesForOrder,
  psDateToIso,
  calcOrder,
  generateSimulatedProxies,
  prolongMake,
  prolongCalc,
  listProxies,
} from "./proxyseller.server";
import type { PsProxyItem, PsProxyKind } from "./proxyseller.server";
import { notifyAllAdmins } from "./notifications.server";
import * as vps from "./fastproxy-vps.server";

/**
 * IPv6 families that share the SAME upstream pool when country matches.
 * IPv6 BR and IPv6-FB BR are literally the same IPs at the provider — only
 * differ by how the platform exposes them. Never buy a new block if a sibling
 * has stock available. See docs/PROXY-CATALOG.md.
 */
const SIBLING_CATEGORIES: Record<string, string[]> = {
  ipv6: ["ipv6", "ipv6_fb"],
  ipv6_fb: ["ipv6", "ipv6_fb"],
};

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

function isIpv6Category(category: string | null | undefined): boolean {
  return category === "ipv6" || category === "ipv6_fb";
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

type ProviderStockRow = {
  id: string;
  external_proxy_id: string | null;
  host: string | null;
  port: number | null;
  username?: string | null;
  password?: string | null;
  protocol?: string | null;
  expires_at?: string | null;
  provider_order_id?: string | null;
};

function providerHost(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end > 0 ? value.slice(1, end) : value.replace(/^\[|\]$/g, "");
  }
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(value)) {
    return value.split(":")[0] ?? value;
  }
  return value.replace(/^\[|\]$/g, "");
}

function endpointKey(host: string | null | undefined, port: number | string | null | undefined): string | null {
  const cleanHost = providerHost(host);
  if (!cleanHost || port === null || port === undefined) return null;
  return `${cleanHost}:${String(port)}`;
}

async function vpsUsernamesForStockIds(stockIds: string[]): Promise<string[]> {
  if (stockIds.length === 0) return [];
  const { data } = await supabaseAdmin
    .from("proxy_stock")
    .select("username, provider_order_id, provider_orders(provider)")
    .in("id", stockIds);
  const usernames = new Set<string>();
  for (const row of (data ?? []) as unknown as Array<{
    username?: string | null;
    provider_orders?: { provider?: string | null } | null;
  }>) {
    if (row.provider_orders?.provider === "fastproxy_vps" && row.username) {
      usernames.add(row.username);
    }
  }
  return Array.from(usernames);
}

async function suspendVpsCredentials(stockIds: string[]): Promise<void> {
  const usernames = await vpsUsernamesForStockIds(stockIds);
  for (const u of usernames) {
    try { await vps.suspendCredential(u); }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      void notifyAllAdmins({
        title: "⚠️ VPS: falha ao suspender credencial",
        body: `Não consegui suspender o usuário ${u} na VPS: ${msg}`,
        metadata: { username: u, error: msg },
        dedupeKey: `vps-suspend-fail:${u}:${Math.floor(Date.now() / 3600000)}`,
      });
    }
  }
}

async function restoreVpsCredentials(stockIds: string[]): Promise<void> {
  if (stockIds.length === 0) return;
  const { data } = await supabaseAdmin
    .from("proxy_stock")
    .select("username, password, provider_order_id, provider_orders(provider, external_order_id)")
    .in("id", stockIds);
  for (const row of (data ?? []) as unknown as Array<{
    username?: string | null;
    password?: string | null;
    provider_orders?: { provider?: string | null; external_order_id?: string | null } | null;
  }>) {
    if (row.provider_orders?.provider !== "fastproxy_vps") continue;
    if (!row.username || !row.password) continue;
    try {
      await vps.upsertCredential({
        username: row.username,
        password: row.password,
        block_id: row.provider_orders.external_order_id ?? undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      void notifyAllAdmins({
        title: "⚠️ VPS: falha ao reativar credencial",
        body: `Não consegui reativar o usuário ${row.username} na VPS: ${msg}`,
        metadata: { username: row.username, error: msg },
        dedupeKey: `vps-restore-fail:${row.username}:${Math.floor(Date.now() / 3600000)}`,
      });
    }
  }
}

export async function restoreHiddenProxiesForPaidOrder(orderId: string): Promise<number> {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.status !== "paid") return 0;

  const { data: rows } = await supabaseAdmin
    .from("customer_proxies")
    .select("id, stock_id")
    .eq("order_id", orderId)
    .in("status", ["grace", "cancelled"]);

  const ids = (rows ?? []).map((row) => row.id as string).filter(Boolean);
  if (ids.length === 0) return 0;

  const stockIds = (rows ?? [])
    .map((row) => row.stock_id as string | null)
    .filter((id): id is string => !!id);

  const { error } = await supabaseAdmin
    .from("customer_proxies")
    .update({ status: "active", released_at: null } as never)
    .in("id", ids);
  if (error) throw new Error(error.message);

  if (stockIds.length > 0) {
    await supabaseAdmin
      .from("proxy_stock")
      .update({ status: "allocated" as never })
      .in("id", stockIds);
    // Reativa credenciais no 3proxy da VPS (no-op para stock de outros provedores).
    await restoreVpsCredentials(stockIds);
  }

  return ids.length;
}

export async function hideOrReleaseProxiesForOrder(orderId: string): Promise<{
  hidden_ipv6: number;
  released: number;
}> {
  const { data: allocs } = await supabaseAdmin
    .from("customer_proxies")
    .select("id, stock_id, proxy_stock(product_id, products(category))")
    .eq("order_id", orderId)
    .in("status", ["active", "grace"]);

  const hiddenIds: string[] = [];
  const hiddenStockIds: string[] = [];
  const releasedIds: string[] = [];
  const releasedStockIds: string[] = [];

  for (const allocation of allocs ?? []) {
    const shaped = allocation as unknown as {
      id?: string | null;
      stock_id?: string | null;
      proxy_stock?: { products?: { category?: string | null } | null } | null;
    };
    const allocationId = shaped.id;
    if (!allocationId) continue;

    const category = shaped.proxy_stock?.products?.category ?? null;
    if (isIpv6Category(category)) {
      hiddenIds.push(allocationId);
      if (shaped.stock_id) hiddenStockIds.push(shaped.stock_id);
    } else {
      releasedIds.push(allocationId);
      if (shaped.stock_id) releasedStockIds.push(shaped.stock_id);
    }
  }

  const now = new Date().toISOString();

  if (hiddenIds.length > 0) {
    await supabaseAdmin
      .from("customer_proxies")
      .update({ status: "cancelled", released_at: now } as never)
      .in("id", hiddenIds);

    if (hiddenStockIds.length > 0) {
      await supabaseAdmin
        .from("proxy_stock")
        .update({ status: "allocated" as never })
        .in("id", hiddenStockIds);
    }
  }

  if (releasedIds.length > 0) {
    await supabaseAdmin
      .from("customer_proxies")
      .update({ status: "released", released_at: now } as never)
      .in("id", releasedIds);

    if (releasedStockIds.length > 0) {
      await supabaseAdmin
        .from("proxy_stock")
        .update({ status: "available" as never })
        .in("id", releasedStockIds)
        .eq("status", "allocated");
    }
  }

  // Suspende credenciais no 3proxy da VPS para tudo que foi escondido/liberado
  // (só afeta stock cujo provider_order.provider = 'fastproxy_vps').
  const allStockIds = [...hiddenStockIds, ...releasedStockIds];
  if (allStockIds.length > 0) {
    await suspendVpsCredentials(allStockIds);
  }

  return { hidden_ipv6: hiddenIds.length, released: releasedIds.length };
}


async function reconcileStockRowsFromProviderList(
  kind: PsProxyKind,
  rows: ProviderStockRow[],
): Promise<{ rows: ProviderStockRow[]; updates: number; missing: number }> {
  if (rows.length === 0) return { rows, updates: 0, missing: 0 };

  const items = await listProxies(kind);
  const byExternalId = new Map(items.map((item) => [String(item.id), item]));
  const byEndpoint = new Map<string, PsProxyItem>();
  for (const item of items) {
    const key = endpointKey(item.ip_only || item.ip, item.port_http);
    if (key) byEndpoint.set(key, item);
  }

  let updates = 0;
  let missing = 0;
  const reconciled: ProviderStockRow[] = [];

  for (const row of rows) {
    const endpoint = endpointKey(row.host, row.port);
    const item = row.external_proxy_id ? byExternalId.get(row.external_proxy_id) : undefined;
    const matched = item ?? (endpoint ? byEndpoint.get(endpoint) : undefined);

    if (!matched) {
      missing++;
      reconciled.push(row);
      continue;
    }

    const nextHost = providerHost(matched.ip_only || matched.ip);
    const nextPort = Number(matched.port_http) || row.port;
    const nextExpiry = psDateToIso(matched.date_end) ?? row.expires_at ?? null;
    const patch: Record<string, unknown> = {};

    if (matched.id && matched.id !== row.external_proxy_id) patch.external_proxy_id = matched.id;
    if (nextHost && nextHost !== row.host) patch.host = nextHost;
    if (nextPort && nextPort !== row.port) patch.port = nextPort;
    if (matched.login && matched.login !== row.username) patch.username = matched.login;
    if (matched.password && matched.password !== row.password) patch.password = matched.password;
    if (matched.protocol && matched.protocol.toLowerCase() !== row.protocol) patch.protocol = matched.protocol.toLowerCase();
    if (nextExpiry && (!row.expires_at || new Date(nextExpiry).getTime() !== new Date(row.expires_at).getTime())) {
      patch.expires_at = nextExpiry;
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from("proxy_stock").update(patch as never).eq("id", row.id);
      if (!error) updates++;
    }

    reconciled.push({
      ...row,
      external_proxy_id: matched.id || row.external_proxy_id,
      host: nextHost ?? row.host,
      port: nextPort ?? row.port,
      username: matched.login ?? row.username,
      password: matched.password ?? row.password,
      protocol: matched.protocol?.toLowerCase() ?? row.protocol,
      expires_at: nextExpiry,
    });
  }

  return { rows: reconciled, updates, missing };
}

/**
 * Allocates proxies from stock to a paid order.
 * - quantityNeeded = order.quantity * product.block_size
 * - picks `available` proxy_stock rows matching the order's product
 * - For IPv6 categories: if stock is short, auto-purchase from ProxySeller
 *   (reuses freed stock first, only buys when truly empty)
 * - inserts into customer_proxies and flips stock status to `allocated`
 * Idempotent: if proxies are already allocated for this order, does nothing.
 */
export async function allocateProxiesForOrder(orderId: string, opts: { allowAutoPurchase?: boolean } = {}): Promise<{
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

  await restoreHiddenProxiesForPaidOrder(order.id);

  const { data: product } = await supabaseAdmin
    .from("products")
    .select("id, block_size, category, country_code, provider_tariff_id, delivery_mode, restock_threshold, provider")
    .eq("id", order.product_id)
    .maybeSingle();
  if (!product) throw new Error("product not found");

  const totalNeeded = order.quantity * (product.block_size ?? 1);

  // Already allocated for this order?
  const { count: existing } = await supabaseAdmin
    .from("customer_proxies")
    .select("*", { count: "exact", head: true })
    .eq("order_id", order.id)
    .eq("status", "active");

  if ((existing ?? 0) >= totalNeeded) {
    return { allocated: existing ?? 0, short: 0 };
  }

  const remaining = totalNeeded - (existing ?? 0);

  // ───────── 1) Pick available stock first (reuse freed IPs) ─────────
  let picks = await pickAvailableStockWithSiblings(product, remaining, order.id);

  // ───────── 2) If short → reuse pending, sync provider, then auto-purchase ─────────
  // Works for any product with a provider_tariff_id (IPv6/IPv6-FB → stock,
  // IPv4/ISP → direct on-demand. Direct products typically have no stock, so
  // every paid order triggers a provider purchase here.)
  const canAutoPurchase = !!product.provider_tariff_id && opts.allowAutoPurchase !== false;
  const stillShort = remaining - picks.length;

  let purchaseError: string | undefined;
  let pendingInFlight = false;
  if (stillShort > 0 && canAutoPurchase) {
    // 2a) Reuse recent pending provider_orders before spending more money
    const reused = await tryFulfillFromPendingOrders(product, order.id);
    if (reused > 0) {
      picks = await pickAvailableStockWithSiblings(product, remaining, order.id);
    }

    // 2b) Sync provider's /proxy/list — pull any IPs that already exist
    // at ProxySeller into our stock before deciding to buy a new block.
    // This is the #1 protection against double-spending.
    if (remaining - picks.length > 0) {
      const synced = await syncProviderInventoryIntoStock(product).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[allocation] provider sync failed:", e);
        void notifyAllAdmins({
          title: "⚠️ Sync ProxySeller falhou — AÇÃO NECESSÁRIA",
          body: `Não consegui listar IPs do provedor antes de comprar (${product.category}/${product.country_code ?? "?"}): ${msg}. Alerta se repete a cada hora até resolver.`,
          link: "/admin/inventory",
          metadata: { productId: product.id, error: msg },
          dedupeKey: `sync-fail:${product.id}:${Math.floor(Date.now() / 3600000)}`,
        });
        return 0;
      });
      if (synced > 0) {
        picks = await pickAvailableStockWithSiblings(product, remaining, order.id);
      }
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
            title: "📉 Estoque baixo — comprando bloco novo",
            body: `Um cliente pagou e precisa de ${remaining} IP(s) do plano ${product.category}/${product.country_code ?? "?"}, mas faltam ${stillShortAfterReuse} no estoque. Estamos comprando um bloco novo na ProxySeller agora — leva ~1 min. Nada a fazer, só acompanhar.`,
            link: "/admin/inventory",
            metadata: { orderId: order.id, productId: product.id, shortBy: stillShortAfterReuse },
            dedupeKey: `stock-short:${order.id}`,
          });

          try {
            const bought = await autoPurchaseIntoStock(product, stillShortAfterReuse, order.id);
            if (bought > 0) {
              void notifyAllAdmins({
                title: "📦 Estoque renovado",
                body: `+${bought} IPs adicionados ao produto ${product.category}/${product.country_code ?? "?"} via compra automática.`,
                link: "/admin/inventory",
                metadata: { productId: product.id, added: bought },
                dedupeKey: `restock-auto:${order.id}`,
              });
              picks = await pickAvailableStockWithSiblings(product, remaining, order.id);
            } else {
              // bought=0 means provider order placed but IPs not yet ready → backfill will finish
              pendingInFlight = true;
            }
          } catch (e) {
            purchaseError = e instanceof Error ? e.message : String(e);
            console.error("[allocation] auto-purchase IPv6 failed:", e);
            const isInsufficientFunds = /insufficient funds/i.test(purchaseError);
            void notifyAllAdmins({
              title: isInsufficientFunds
                ? "💸 SALDO ProxySeller INSUFICIENTE — RECARREGUE"
                : "🛑 Falha na compra automática — AÇÃO NECESSÁRIA",
              body: isInsufficientFunds
                ? `Cliente ${order.id.slice(0, 8)} pagou e está SEM PROXY. ProxySeller: ${purchaseError}. Recarregue o saldo em https://proxy-seller.com/personal/balance — assim que recarregar, o sistema aloca sozinho na próxima varredura (5 min).`
                : `ProxySeller falhou ao comprar IPs para ${product.category}/${product.country_code ?? "?"} (pedido ${order.id.slice(0, 8)}): ${purchaseError}. O alerta se repete até ser resolvido.`,
              link: "/admin/inventory",
              metadata: { orderId: order.id, productId: product.id, error: purchaseError, insufficientFunds: isInsufficientFunds },
              // Saldo baixo: re-arma a cada 15 min (urgente). Outros erros: a cada hora.
              dedupeKey: isInsufficientFunds
                ? `low-balance:${Math.floor(Date.now() / (15 * 60000))}`
                : `restock-fail:${product.id}:${Math.floor(Date.now() / 3600000)}`,
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

  // ───────── 3) Proactive restock DESATIVADO por decisão do dono ─────────
  // Só compramos blocos novos quando um pedido pago realmente precisa de IPs
  // (fluxo 2c acima). Nada de compra especulativa por threshold.
  // Para reativar no futuro: chamar maybeProactiveRestock(product, order.id).
  void maybeProactiveRestock; // referencia p/ não quebrar lint de "unused"

  return {
    allocated: (existing ?? 0) + picks.length,
    short: remaining - picks.length,
    error: purchaseError,
  };
}

/** Fire-and-forget: top up stock when available count ≤ restock_threshold. */
async function maybeProactiveRestock(
  product: {
    id: string;
    provider_tariff_id: string | null;
    country_code: string | null;
    category?: string | null;
    restock_threshold?: number | null;
  },
  triggeringOrderId: string,
): Promise<void> {
  try {
    const threshold = product.restock_threshold ?? 2;

    // Count sibling pool availability (IPv6 BR + IPv6-FB BR share upstream IPs).
    // Without this, threshold=10 on ipv6-br would ignore free IPs sitting in
    // ipv6-fb-br and buy blocks needlessly. See docs/PROXY-CATALOG.md.
    const family = SIBLING_CATEGORIES[product.category ?? ""] ?? [];
    let poolIds: string[] = [product.id];
    if (family.length > 0 && product.country_code) {
      const { data: siblings } = await supabaseAdmin
        .from("products")
        .select("id")
        .in("category", family as ("ipv4" | "ipv6" | "ipv6_fb" | "isp")[])
        .eq("country_code", product.country_code);
      poolIds = Array.from(new Set([product.id, ...((siblings ?? []).map((s) => s.id as string))]));
    }

    const { count: avail } = await supabaseAdmin
      .from("proxy_stock")
      .select("*", { count: "exact", head: true })
      .in("product_id", poolIds)
      .eq("status", "available");
    if ((avail ?? 0) > threshold) return;

    // Skip if another pending provider order is already in-flight (any sibling)
    const cutoff = new Date(Date.now() - PENDING_BLOCK_NEW_BUY_MS).toISOString();
    const { count: openPending } = await supabaseAdmin
      .from("provider_orders")
      .select("*", { count: "exact", head: true })
      .in("product_id", poolIds)
      .eq("status", "pending")
      .gte("created_at", cutoff);
    if ((openPending ?? 0) > 0) return;

    const lockOk = await tryAcquirePurchaseLock(product.id, `restock:${triggeringOrderId}`);
    if (!lockOk) return;
    try {
      await autoPurchaseIntoStock(product, PROXYSELLER_IPV6_MIN_BLOCK, triggeringOrderId);
      void notifyAllAdmins({
        title: "♻️ Restock automático",
        body: `Pool ${product.category}/${product.country_code ?? "?"} caiu para ${avail ?? 0} (limite ${threshold}). Comprando bloco de reserva.`,
        link: "/admin/inventory",
        metadata: { productId: product.id, available: avail ?? 0, threshold, poolIds },
        dedupeKey: `proactive-restock:${product.country_code ?? product.id}:${Math.floor(Date.now() / 60000)}`,
      });
    } finally {
      await releasePurchaseLock(product.id);
    }
  } catch (e) {
    console.error("[allocation] proactive restock failed:", e);
  }
}

/**
 * Buys a block from ProxySeller and inserts the proxies into stock.
 * Generic for all kinds (ipv6/ipv4/isp). Reads ProxySeller config from
 * product.provider_tariff_id as JSON. For IPv6 the provider enforces a
 * minimum block of 10; for IPv4/ISP we buy exactly what is needed.
 */
async function autoPurchaseIntoStock(
  product: {
    id: string;
    provider_tariff_id: string | null;
    country_code: string | null;
    category?: string | null;
  },
  needed: number,
  triggeredByOrderId: string,
): Promise<number> {
  // Route to VPS when the product is provisioned by our own infra.
  const { data: prodMeta } = await supabaseAdmin
    .from("products")
    .select("provider")
    .eq("id", product.id)
    .maybeSingle();
  const provider = (prodMeta as { provider?: string } | null)?.provider ?? "proxyseller";
  if (provider === "fastproxy_vps") {
    // Check source_mode: 'stock' = manually-managed pool, never call the VPS.
    const { data: vpsSettings } = await supabaseAdmin
      .from("provider_settings")
      .select("source_mode, dry_run")
      .eq("provider", "fastproxy_vps")
      .maybeSingle();
    const mode = (vpsSettings as { source_mode?: string } | null)?.source_mode ?? "api";
    if (mode === "stock") {
      // Manual stock mode: alert admin, do NOT attempt a purchase.
      try {
        await notifyAllAdmins({
          title: "⚠️ Estoque IPv6 esgotou (modo manual)",
          body: `Produto ${product.id.slice(0, 8)} precisa de ${needed} IPs mas o estoque manual está vazio. Adicione IPs em /admin/vps.`,
          link: "/admin/vps",
          metadata: { productId: product.id, needed },
          dedupeKey: `manual-stock-empty:${product.id}:${new Date().toISOString().slice(0, 10)}`,
        });
      } catch { /* ignore notify errors */ }
      return 0;
    }
    if (!(await vps.isVpsEnabled())) {
      throw new Error("fastproxy_vps disabled: flip provider_settings.fastproxy_vps.dry_run to false to enable");
    }
    return await vpsPurchaseIntoStock(product, needed, triggeredByOrderId);
  }


  // ProxySeller path: respect proxyseller.source_mode='stock' → don't purchase, just alert admin.
  const { data: psSettings } = await supabaseAdmin
    .from("provider_settings")
    .select("source_mode")
    .eq("provider", "proxyseller")
    .maybeSingle();
  const psMode = (psSettings as { source_mode?: string } | null)?.source_mode ?? "api";
  if (psMode === "stock") {
    try {
      await notifyAllAdmins({
        title: "⚠️ Estoque ProxySeller esgotou (modo manual)",
        body: `Produto ${product.id.slice(0, 8)} precisa de ${needed} IPs mas o modo é 'Estoque' e não há mais IPs. Adicione IPs em /admin/vps ou alterne para 'API ProxySeller'.`,
        link: "/admin/vps",
        metadata: { productId: product.id, needed },
        dedupeKey: `manual-stock-empty-ps:${product.id}:${new Date().toISOString().slice(0, 10)}`,
      });
    } catch { /* ignore notify errors */ }
    return 0;
  }

  if (!product.provider_tariff_id) {
    throw new Error(`product ${product.id} missing provider_tariff_id (ProxySeller config)`);
  }

  const kind = categoryToKind(product.category);
  // IPv6 minimum block at provider is 10. IPv4/ISP buy what's needed.
  const minBlock = kind === "ipv6" ? PROXYSELLER_IPV6_MIN_BLOCK : 1;
  const quantityToBuy = Math.max(needed, minBlock);

  let cfg: Record<string, unknown> & {
    countryId?: number;
    periodId?: string;
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
    const calc = await calcOrder(kind, { ...cfg, quantity: quantityToBuy });
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
        kind,
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

  const result = await purchaseProxyBlock(kind, { ...cfg, quantity: quantityToBuy });

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
      raw_payload: { baseOrderNumber: result.baseOrderNumber, kind } as never,
    })
    .select("id")
    .maybeSingle();

  if (!isReady) return 0;

  return await insertProxiesToStock(product, provOrder?.id ?? null, result.proxies);
}


export async function insertProxiesToStock(
  product: { id: string; country_code: string | null },
  providerOrderId: string | null,
  proxies: PsProxyItem[],
): Promise<number> {
  const uniqueProxies = Array.from(
    new Map(proxies.map((p) => [`${p.id}:${p.port_http}`, p])).values(),
  );

  const existingKeys = new Set<string>();
  if (providerOrderId && uniqueProxies.length > 0) {
    const externalIds = uniqueProxies.map((p) => p.id).filter(Boolean);
    const { data: existing } = await supabaseAdmin
      .from("proxy_stock")
      .select("external_proxy_id, port")
      .eq("provider_order_id", providerOrderId)
      .in("external_proxy_id", externalIds);

    for (const row of existing ?? []) {
      existingKeys.add(`${row.external_proxy_id}:${row.port}`);
    }
  }

  const stockRows = uniqueProxies
    .filter((p) => !existingKeys.has(`${p.id}:${p.port_http}`))
    .map((p) => ({
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
 * VPS variant of autoPurchaseIntoStock: creates a fresh block on our own
 * infrastructure and ingests the returned IPs into `proxy_stock`. Records
 * a `provider_orders` row with provider='fastproxy_vps' so the renewal
 * sweep can route it back to the VPS adapter later.
 */
async function vpsPurchaseIntoStock(
  product: { id: string; country_code: string | null; category?: string | null },
  needed: number,
  triggeredByOrderId: string,
): Promise<number> {
  const size = Math.max(needed, 10);
  const block = await vps.createBlock({
    size,
    duration_days: 30,
    customer_ref: triggeredByOrderId,
  });

  const proxies = block.proxies ?? [];
  const isReady = proxies.length > 0;

  const { data: provOrder } = await supabaseAdmin
    .from("provider_orders")
    .insert({
      product_id: product.id,
      provider: "fastproxy_vps",
      external_order_id: block.id,
      status: isReady ? "active" : "pending",
      quantity: proxies.length,
      cost_cents: 0,
      country_code: product.country_code,
      triggered_by_order_id: triggeredByOrderId,
      expires_at: block.expires_at ?? null,
      raw_payload: { blockId: block.id, size, source: "fastproxy_vps" } as never,
    })
    .select("id")
    .maybeSingle();

  if (!isReady) return 0;

  const stockRows = proxies.map((p) => ({
    product_id: product.id,
    provider_order_id: provOrder?.id ?? null,
    external_proxy_id: `vps:${block.id}:${p.ip}:${p.port}`,
    host: p.ip,
    port: p.port,
    username: p.username ?? null,
    password: p.password ?? null,
    protocol: (p.protocol || "http").toLowerCase(),
    country_code: product.country_code,
    status: "available" as const,
    expires_at: block.expires_at ?? null,
  }));

  const { error: stockErr } = await supabaseAdmin.from("proxy_stock").insert(stockRows);
  if (stockErr) throw new Error(`vps stock insert failed: ${stockErr.message}`);

  return stockRows.length;
}

/**
 * Try to recover IPs from a previously-placed provider order that returned no
 * proxies yet (race between /order/make and ProxySeller provisioning).
 * Returns number of IPs newly added to stock.
 */
async function tryFulfillFromPendingOrders(
  product: { id: string; country_code: string | null; category?: string | null },
  triggeredByOrderId: string,
): Promise<number> {
  const kind = categoryToKind(product.category);
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
      proxies = await pollProxiesForOrder(baseOrderNumber, 1, [500, 1500], kind);
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

  const cat = product.category ?? "";
  const isRenewable = cat === "ipv6" || cat === "ipv6_fb" || cat === "ipv4" || cat === "isp";
  if (!isRenewable) {
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

  // Blocos (provider_orders) que contêm proxies de pedido realmente pago.
  // Proxies em grace/cancelled ficam ocultos para o cliente e não acionam renovação.
  const { data: activeAllocs } = await supabaseAdmin
    .from("customer_proxies")
    .select("stock_id")
    .eq("order_id", orderId)
    .eq("status", "active");

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

  // VPS branch: renew each self-hosted block through our own API.
  const { data: blockMeta } = await supabaseAdmin
    .from("provider_orders")
    .select("id, provider, external_order_id")
    .in("id", blockIds);
  const vpsBlocks = (blockMeta ?? []).filter(
    (b) => (b as { provider?: string }).provider === "fastproxy_vps",
  );
  if (vpsBlocks.length > 0 && vpsBlocks.length === (blockMeta ?? []).length) {
    let renewedIps = 0;
    for (const b of vpsBlocks) {
      const extId = (b as { external_order_id?: string | null }).external_order_id;
      if (!extId) continue;
      const res = await vps.renewBlock(extId, 30);
      const newExpiry = res.expires_at ?? new Date(Date.now() + 30 * 86400 * 1000).toISOString();
      await supabaseAdmin
        .from("proxy_stock")
        .update({ expires_at: newExpiry } as never)
        .eq("provider_order_id", (b as { id: string }).id);
      await supabaseAdmin
        .from("provider_orders")
        .update({ expires_at: newExpiry, purchased_at: new Date().toISOString() } as never)
        .eq("id", (b as { id: string }).id);
      const { count } = await supabaseAdmin
        .from("proxy_stock")
        .select("*", { count: "exact", head: true })
        .eq("provider_order_id", (b as { id: string }).id);
      renewedIps += count ?? 0;
    }
    return {
      renewed_proxies: renewedIps,
      renewed_blocks: vpsBlocks.length,
      cost_usd: 0,
      dry_run: false,
    };
  }

  // Todos os IPs (alocados + livres) que pertencem a esses blocos
  const { data: blockStockRaw } = await supabaseAdmin
    .from("proxy_stock")
    .select("id, external_proxy_id, host, port, username, password, protocol, expires_at, provider_order_id")
    .in("provider_order_id", blockIds);
  let blockStock = (blockStockRaw ?? []) as ProviderStockRow[];

  const kind: PsProxyKind = cat === "ipv4" ? "ipv4" : cat === "isp" ? "isp" : "ipv6";
  if (blockStock.length > 0) {
    try {
      const reconciled = await reconcileStockRowsFromProviderList(kind, blockStock);
      blockStock = reconciled.rows;
      if (reconciled.updates > 0) {
        void notifyAllAdmins({
          title: "🔄 Proxies sincronizados com o provedor",
          body: `Atualizei ${reconciled.updates} proxy(s) do pedido ${orderId.slice(0, 8)} com os dados atuais do provedor antes da renovação.`,
          link: `/admin/orders/${orderId}`,
          metadata: { orderId, updates: reconciled.updates, missing: reconciled.missing },
          dedupeKey: `renewal-sync:${orderId}:${Math.floor(Date.now() / 3600000)}`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      void notifyAllAdmins({
        title: "⚠️ Sync antes da renovação falhou",
        body: `Não consegui conferir os proxies do pedido ${orderId.slice(0, 8)} no provedor: ${msg}. Vou tentar renovar mesmo assim.`,
        link: `/admin/orders/${orderId}`,
        metadata: { orderId, error: msg },
        dedupeKey: `renewal-presync-fail:${orderId}:${Math.floor(Date.now() / 3600000)}`,
      });
    }
  }
  const externalIds = (blockStock ?? [])
    .map((r) => r.external_proxy_id)
    .filter((x): x is string => !!x);
  if (externalIds.length === 0) {
    return { renewed_proxies: 0, renewed_blocks: blockIds.length, cost_usd: 0, dry_run: false, skipped_reason: "no external_proxy_id (dry-run/sim block)" };
  }

  const { data: settings } = await supabaseAdmin
    .from("provider_settings")
    .select("dry_run")
    .eq("provider", "proxyseller")
    .maybeSingle();
  const dryRun = !!(settings as { dry_run?: boolean } | null)?.dry_run;

  let costUsd = 0;
  try {
    if (dryRun) {
      const calc = await prolongCalc(kind, { ids: externalIds, periodId: cfg.periodId });
      costUsd = Number(calc.total) || 0;
    } else {
      const result = await prolongMake(kind, { ids: externalIds, periodId: cfg.periodId });
      costUsd = Number(result.total) || 0;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${msg}. Mantive os IPs atuais para preservar estabilidade; admin deve resolver saldo/provedor e tentar renovar novamente.`);
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

// ─────────────────────────── Stock-picking helpers ───────────────────────────

type StockPick = { id: string };

/**
 * Pick available stock for a product. If the product belongs to an IPv6
 * family (ipv6 / ipv6_fb), it also pulls from sibling products of the SAME
 * country (they share the same upstream pool at ProxySeller). When a sibling's
 * IP is picked, its product_id is rewritten to the current product so the
 * accounting stays clean. See docs/PROXY-CATALOG.md.
 */
async function pickAvailableStockWithSiblings(
  product: { id: string; category?: string | null; country_code: string | null },
  remaining: number,
  orderId: string,
): Promise<StockPick[]> {
  if (remaining <= 0) return [];

  // Build the pool: own product + siblings of the SAME family/country.
  // For non-IPv6 families there are no siblings → pool = [product.id].
  const family = SIBLING_CATEGORIES[product.category ?? ""] ?? [];
  let poolIds: string[] = [product.id];
  if (family.length > 0 && product.country_code) {
    const { data: siblings } = await supabaseAdmin
      .from("products")
      .select("id")
      .in("category", family as ("ipv4" | "ipv6" | "ipv6_fb" | "isp")[])
      .eq("country_code", product.country_code);
    poolIds = Array.from(new Set([product.id, ...((siblings ?? []).map((s) => s.id as string))]));
  }

  // Consolidation RPC: returns available IPs ordered by block-occupancy DESC,
  // then expires_at ASC. Fills partially-used blocks first so empty blocks
  // stay empty and can be abandoned at renewal time.
  const { data: ranked, error: rankErr } = await supabaseAdmin.rpc(
    "pick_consolidated_stock",
    { _product_ids: poolIds, _limit: remaining },
  );

  if (rankErr) {
    console.error("[allocation] pick_consolidated_stock failed, fallback:", rankErr);
    const { data: fb } = await supabaseAdmin
      .from("proxy_stock")
      .select("id, product_id")
      .in("product_id", poolIds)
      .eq("status", "available")
      .limit(remaining);
    const ids = (fb ?? []).map((r) => r.id as string);
    const borrowed = (fb ?? [])
      .filter((r) => r.product_id !== product.id)
      .map((r) => r.id as string);
    if (borrowed.length > 0) {
      await supabaseAdmin.from("proxy_stock").update({ product_id: product.id }).in("id", borrowed);
    }
    return ids.map((id) => ({ id }));
  }

  const rows = (ranked ?? []) as Array<{ stock_id: string }>;
  if (rows.length === 0) return [];
  const pickedIds = rows.map((r) => r.stock_id);

  // Transfer ownership of any sibling-borrowed IPs to current product.
  const { error: mvErr } = await supabaseAdmin
    .from("proxy_stock")
    .update({ product_id: product.id })
    .in("id", pickedIds)
    .neq("product_id", product.id);
  if (mvErr) console.error("[allocation] consolidation transfer failed:", mvErr);

  console.log(
    `[allocation] order=${orderId} consolidated pick ${pickedIds.length} IPs ` +
      `(${product.category}/${product.country_code}) — prioritized occupied blocks`,
  );

  return pickedIds.map((id) => ({ id }));
}

/**
 * Calls ProxySeller `/proxy/list/{kind}` and ingests any IP that is NOT yet
 * tracked in `proxy_stock`. Defensive step BEFORE buying a new block — if a
 * previous run already paid for IPs (manual purchase, missed webhook, etc.),
 * we recover them instead of paying again.
 *
 * Returns the number of IPs newly inserted into stock.
 */
async function syncProviderInventoryIntoStock(product: {
  id: string;
  category?: string | null;
  country_code: string | null;
  provider_tariff_id: string | null;
}): Promise<number> {
  if (!product.provider_tariff_id) return 0;

  // Skip in dry-run mode (no real provider state to sync)
  const { data: settings } = await supabaseAdmin
    .from("provider_settings")
    .select("dry_run")
    .eq("provider", "proxyseller")
    .maybeSingle();
  if ((settings as { dry_run?: boolean } | null)?.dry_run) return 0;

  const kind = categoryToKind(product.category);

  let cfg: { countryId?: number };
  try {
    cfg = JSON.parse(product.provider_tariff_id);
  } catch {
    return 0;
  }

  let items: PsProxyItem[];
  try {
    items = await listProxies(kind);
  } catch (e) {
    console.error("[allocation] listProxies failed:", e);
    return 0;
  }
  if (!items.length) return 0;

  // Filter by country when ProxySeller returns it. Otherwise accept all and
  // rely on de-dup by external_proxy_id.
  const filtered = cfg.countryId
    ? items.filter((p) => {
        const c = (p as unknown as { country?: number | string }).country;
        return c === undefined || String(c) === String(cfg.countryId);
      })
    : items;
  if (!filtered.length) return 0;

  // Skip IPs we already track anywhere
  const externalIds = filtered.map((p) => p.id).filter(Boolean);
  const { data: known } = await supabaseAdmin
    .from("proxy_stock")
    .select("external_proxy_id")
    .in("external_proxy_id", externalIds);
  const knownSet = new Set((known ?? []).map((r) => r.external_proxy_id as string));
  const fresh = filtered.filter((p) => !knownSet.has(p.id));
  if (!fresh.length) return 0;

  const added = await insertProxiesToStock(product, null, fresh);
  if (added > 0) {
    console.log(
      `[allocation] synced ${added} pre-existing IPs from ProxySeller into stock ` +
        `for ${product.category}/${product.country_code} — avoided new block purchase`,
    );
  }
  return added;
}



// ─────────────────────── Full provider sync ───────────────────────

/**
 * Iterates every product with a `provider_tariff_id` and ingests every IP
 * the ProxySeller account exposes that we don't already track. Reconciles
 * `expires_at` when the provider reports a fresher date. Never re-allocates
 * IPs that are already linked to a customer.
 *
 * Designed to be safe to call hourly. Skipped entirely in dry_run mode.
 */
export async function runFullProviderSync(): Promise<{
  scanned_products: number;
  new_ips: number;
  expiry_updates: number;
  per_product: Array<{
    product: string;
    kind: PsProxyKind;
    fetched: number;
    inserted: number;
    expiry_updates: number;
  }>;
  errors: string[];
  dry_run: boolean;
}> {
  const { data: settings } = await supabaseAdmin
    .from("provider_settings")
    .select("dry_run")
    .eq("provider", "proxyseller")
    .maybeSingle();
  const dryRun = !!(settings as { dry_run?: boolean } | null)?.dry_run;

  const summary = {
    scanned_products: 0,
    new_ips: 0,
    expiry_updates: 0,
    per_product: [] as Array<{
      product: string;
      kind: PsProxyKind;
      fetched: number;
      inserted: number;
      expiry_updates: number;
    }>,
    errors: [] as string[],
    dry_run: dryRun,
  };

  if (dryRun) return summary;

  const { data: products } = await supabaseAdmin
    .from("products")
    .select("id, slug, category, country_code, provider_tariff_id")
    .not("provider_tariff_id", "is", null);

  // Cache provider list per kind — listProxies returns ALL IPs of that kind,
  // not filtered by country. We then filter per product.countryId.
  const cache = new Map<PsProxyKind, PsProxyItem[]>();

  for (const p of products ?? []) {
    summary.scanned_products++;
    const kind = categoryToKind(p.category);

    let cfg: { countryId?: number };
    try {
      cfg = JSON.parse(p.provider_tariff_id as string);
    } catch {
      summary.errors.push(`${p.slug}: invalid provider_tariff_id`);
      continue;
    }

    let items: PsProxyItem[];
    try {
      if (!cache.has(kind)) {
        cache.set(kind, await listProxies(kind));
      }
      items = cache.get(kind) ?? [];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      summary.errors.push(`${p.slug} listProxies: ${msg}`);
      continue;
    }

    const filtered = cfg.countryId
      ? items.filter((it) => {
          const c = (it as unknown as { country?: number | string }).country;
          return c === undefined || String(c) === String(cfg.countryId);
        })
      : items;

    if (filtered.length === 0) {
      summary.per_product.push({
        product: p.slug,
        kind,
        fetched: 0,
        inserted: 0,
        expiry_updates: 0,
      });
      continue;
    }

    // De-dup against ALL existing rows by external_proxy_id (any product).
    const externalIds = filtered.map((it) => it.id).filter(Boolean);
    const { data: known } = await supabaseAdmin
      .from("proxy_stock")
      .select("id, external_proxy_id, expires_at")
      .in("external_proxy_id", externalIds);
    const knownMap = new Map<string, { id: string; expires_at: string | null }>();
    for (const k of known ?? []) {
      if (k.external_proxy_id) {
        knownMap.set(k.external_proxy_id, { id: k.id, expires_at: k.expires_at });
      }
    }

    const fresh = filtered.filter((it) => !knownMap.has(it.id));
    let inserted = 0;
    if (fresh.length > 0) {
      inserted = await insertProxiesToStock(p, null, fresh);
    }

    // Reconcile expires_at when provider reports newer date.
    let expiryUpdates = 0;
    for (const it of filtered) {
      const known = knownMap.get(it.id);
      if (!known) continue;
      const newIso = psDateToIso(it.date_end);
      if (!newIso) continue;
      if (!known.expires_at || new Date(newIso) > new Date(known.expires_at)) {
        const { error } = await supabaseAdmin
          .from("proxy_stock")
          .update({ expires_at: newIso })
          .eq("id", known.id);
        if (!error) expiryUpdates++;
      }
    }

    summary.new_ips += inserted;
    summary.expiry_updates += expiryUpdates;
    summary.per_product.push({
      product: p.slug,
      kind,
      fetched: filtered.length,
      inserted,
      expiry_updates: expiryUpdates,
    });
  }

  await supabaseAdmin.from("audit_log").insert({
    action: "proxyseller.full_sync",
    source: "cron",
    status: summary.errors.length ? "error" : "ok",
    response: summary as never,
  });

  if (summary.new_ips > 0 || summary.expiry_updates > 0) {
    void notifyAllAdmins({
      title: "🔄 Sync ProxySeller concluído",
      body: `+${summary.new_ips} IPs novos · ${summary.expiry_updates} validades atualizadas em ${summary.scanned_products} produtos.`,
      link: "/admin/inventory",
      metadata: { summary } as never,
      dedupeKey: `full-sync:${new Date().toISOString().slice(0, 13)}`,
    });
  }

  return summary;
}

// ─────────────────────── Renewal sweep ───────────────────────

/**
 * Walks every IPv6 provider_orders (block) expiring within `windowDays`.
 * If the block has at least one paying customer (customer_proxies.status=active), it renews
 * all IPs in the block via `prolong/make`. Empty blocks are skipped so they
 * naturally expire — that's the cost-saver.
 *
 * Works for BR and US blocks symmetrically (uses block.country_code).
 *
 * Set `dryRun=true` (or rely on provider_settings.dry_run) to preview only.
 */
export async function runRenewalSweep(opts: {
  windowDays?: number;
  dryRun?: boolean;
} = {}): Promise<{
  window_days: number;
  blocks_seen: number;
  blocks_renewed: number;
  blocks_abandoned: number;
  ips_renewed: number;
  cost_usd: number;
  cost_saved_usd_estimate: number;
  dry_run: boolean;
  errors: string[];
  details: Array<{
    block: string;
    country: string | null;
    occupancy: number;
    block_size: number;
    action: "renewed" | "abandoned" | "skipped";
    cost_usd?: number;
    reason?: string;
  }>;
}> {
  const windowDays = opts.windowDays ?? 3;
  const { data: settings } = await supabaseAdmin
    .from("provider_settings")
    .select("dry_run")
    .eq("provider", "proxyseller")
    .maybeSingle();
  const dryRun = !!opts.dryRun || !!(settings as { dry_run?: boolean } | null)?.dry_run;

  const out = {
    window_days: windowDays,
    blocks_seen: 0,
    blocks_renewed: 0,
    blocks_abandoned: 0,
    ips_renewed: 0,
    cost_usd: 0,
    cost_saved_usd_estimate: 0,
    dry_run: dryRun,
    errors: [] as string[],
    details: [] as Array<{
      block: string;
      country: string | null;
      occupancy: number;
      block_size: number;
      action: "renewed" | "abandoned" | "skipped";
      cost_usd?: number;
      reason?: string;
    }>,
  };

  const cutoff = new Date(Date.now() + windowDays * 86400 * 1000).toISOString();

  // IPv6, IPv4 and ISP blocks are all renewable through prolong/make.
  // Mobile is provider-managed, skip.
  // NOTE: we no longer filter by `provider_orders.expires_at` here — many blocks
  // have NULL there and the real expiry is stored on `proxy_stock.expires_at`.
  // We fetch all active/pending blocks and compute the effective expiry from
  // the stock rows below.
  const { data: blocks } = await supabaseAdmin
    .from("provider_orders")
    .select("id, country_code, expires_at, product_id, external_order_id, provider, products(slug, category, provider_tariff_id)")
    .in("status", ["active", "pending"]);

  for (const block of blocks ?? []) {
    const prod = (block as { products?: { slug: string; category: string | null; provider_tariff_id: string | null } | null }).products;
    const cat = prod?.category ?? "";
    const isRenewable = cat.startsWith("ipv6") || cat === "ipv4" || cat === "isp";
    if (!prod || !isRenewable) continue;
    const blockProvider = (block as { provider?: string }).provider ?? "proxyseller";
    const kind: PsProxyKind = cat === "ipv4" ? "ipv4" : cat === "isp" ? "isp" : "ipv6";

    out.blocks_seen++;

    // VPS-hosted block: renew via our own API and skip ProxySeller-specific logic.
    if (blockProvider === "fastproxy_vps") {
      const { data: stockRowsRaw } = await supabaseAdmin
        .from("proxy_stock")
        .select("id, expires_at")
        .eq("provider_order_id", block.id);
      const stockRows = stockRowsRaw ?? [];
      const blockSize = stockRows.length;

      const stockExpiryMs = stockRows
        .map((s) => (s.expires_at ? new Date(s.expires_at).getTime() : 0))
        .filter((n) => n > 0);
      const effectiveExpiryMs = block.expires_at
        ? new Date(block.expires_at).getTime()
        : stockExpiryMs.length
          ? Math.min(...stockExpiryMs)
          : 0;
      if (!effectiveExpiryMs || effectiveExpiryMs > new Date(cutoff).getTime()) continue;

      const stockIds = stockRows.map((s) => s.id);
      const { count: occ } = await supabaseAdmin
        .from("customer_proxies")
        .select("*", { count: "exact", head: true })
        .in("stock_id", stockIds.length ? stockIds : ["00000000-0000-0000-0000-000000000000"])
        .eq("status", "active");
      const occupancy = occ ?? 0;

      if (occupancy === 0) {
        if (!dryRun) {
          const extId = (block as { external_order_id?: string | null }).external_order_id;
          if (extId) {
            try {
              await vps.cancelBlock(extId);
            } catch (e) {
              out.errors.push(`${block.id}: vps cancel failed: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          await supabaseAdmin
            .from("proxy_stock")
            .update({ status: "expired" as never })
            .in("id", stockIds)
            .neq("status", "allocated");
        }
        out.blocks_abandoned++;
        out.details.push({
          block: block.id,
          country: block.country_code,
          occupancy: 0,
          block_size: blockSize,
          action: "abandoned",
        });
        continue;
      }

      try {
        const extId = (block as { external_order_id?: string | null }).external_order_id;
        if (!extId) throw new Error("no external_order_id on VPS block");
        if (!dryRun) {
          const res = await vps.renewBlock(extId, 30);
          const newExpiry = res.expires_at ?? new Date(Date.now() + 30 * 86400 * 1000).toISOString();
          if (stockIds.length > 0) {
            await supabaseAdmin.from("proxy_stock").update({ expires_at: newExpiry }).in("id", stockIds);
          }
          await supabaseAdmin
            .from("provider_orders")
            .update({ expires_at: newExpiry, purchased_at: new Date().toISOString() })
            .eq("id", block.id);
        }
        out.blocks_renewed++;
        out.ips_renewed += blockSize;
        out.details.push({
          block: block.id,
          country: block.country_code,
          occupancy,
          block_size: blockSize,
          action: "renewed",
          cost_usd: 0,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        out.errors.push(`${block.id}: ${msg}`);
        void notifyAllAdmins({
          title: "🛑 Falha ao renovar bloco VPS — AÇÃO NECESSÁRIA",
          body: `Bloco VPS ${block.id.slice(0, 8)} (${block.country_code ?? "?"}, ${occupancy} cliente(s)) NÃO renovou: ${msg}. Verifique a VPS em /admin/vps.`,
          link: "/admin/vps",
          metadata: { blockId: block.id, occupancy, error: msg },
          dedupeKey: `renewal-fail-vps:${block.id}:${new Date().toISOString().slice(0, 10)}`,
        });
      }
      continue;
    }


    // All stock rows in this block
    const { data: stockRowsRaw } = await supabaseAdmin
      .from("proxy_stock")
      .select("id, external_proxy_id, host, port, username, password, protocol, expires_at, provider_order_id")
      .eq("provider_order_id", block.id);
    let stockRows = (stockRowsRaw ?? []) as ProviderStockRow[];

    try {
      const reconciled = await reconcileStockRowsFromProviderList(kind, stockRows);
      stockRows = reconciled.rows;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.errors.push(`${block.id}: provider sync failed before renewal: ${msg}`);
    }

    const stockIds = stockRows.map((s) => s.id);
    const externalIds = stockRows.map((s) => s.external_proxy_id).filter((x): x is string => !!x);
    const blockSize = stockIds.length;

    // Effective expiry: use provider_orders.expires_at when set, otherwise
    // fall back to the earliest expires_at across this block's stock rows.
    const stockExpiryMs = (stockRows ?? [])
      .map((s) => (s.expires_at ? new Date(s.expires_at).getTime() : 0))
      .filter((n) => n > 0);
    const effectiveExpiryMs = block.expires_at
      ? new Date(block.expires_at).getTime()
      : (stockExpiryMs.length ? Math.min(...stockExpiryMs) : 0);

    // Only act on blocks whose real expiry is inside the renewal window.
    // Blocks with unknown/no expiry are surfaced as "skipped".
    if (!effectiveExpiryMs) {
      out.details.push({
        block: block.id,
        country: block.country_code,
        occupancy: 0,
        block_size: blockSize,
        action: "skipped",
        reason: "no expiry on block or stock",
      });
      continue;
    }
    if (effectiveExpiryMs > new Date(cutoff).getTime()) {
      // Too far in the future to renew right now — skip silently.
      continue;
    }

    if (blockSize === 0) {
      out.details.push({
        block: block.id,
        country: block.country_code,
        occupancy: 0,
        block_size: 0,
        action: "skipped",
        reason: "no stock rows tied to block",
      });
      continue;
    }

    // Occupancy: how many of this block's IPs are tied to a paying customer.
    // `grace`/`cancelled` allocations are hidden/non-paying and must not spend renewal balance.
    const { count: occ } = await supabaseAdmin
      .from("customer_proxies")
      .select("*", { count: "exact", head: true })
      .in("stock_id", stockIds)
      .eq("status", "active");
    const occupancy = occ ?? 0;

    if (occupancy === 0) {
      // ABANDON — let the block expire. Mark only free rows as expired so
      // hidden IPv6 customer rows remain reserved/hidden and are not resold.
      if (!dryRun) {
        await supabaseAdmin
          .from("proxy_stock")
          .update({ status: "expired" as never })
          .in("id", stockIds)
          .neq("status", "allocated");
      }
      out.blocks_abandoned++;
      // Estimate savings: typical IPv6 block ~ US$0.40/IP/mo × blockSize.
      out.cost_saved_usd_estimate += 0.4 * blockSize;
      out.details.push({
        block: block.id,
        country: block.country_code,
        occupancy: 0,
        block_size: blockSize,
        action: "abandoned",
      });
      continue;
    }

    // RENEW the whole block
    if (!prod.provider_tariff_id || externalIds.length === 0) {
      out.details.push({
        block: block.id,
        country: block.country_code,
        occupancy,
        block_size: blockSize,
        action: "skipped",
        reason: "missing provider_tariff_id or external_proxy_id",
      });
      continue;
    }
    let cfg: { periodId?: string };
    try {
      cfg = JSON.parse(prod.provider_tariff_id);
    } catch {
      out.errors.push(`${block.id}: invalid provider_tariff_id`);
      continue;
    }
    if (!cfg.periodId) {
      out.details.push({
        block: block.id,
        country: block.country_code,
        occupancy,
        block_size: blockSize,
        action: "skipped",
        reason: "no periodId",
      });
      continue;
    }

    try {
      let costUsd = 0;
      if (dryRun) {
        const calc = await prolongCalc(kind, { ids: externalIds, periodId: cfg.periodId });
        costUsd = Number(calc.total) || 0;
      } else {
        const res = await prolongMake(kind, { ids: externalIds, periodId: cfg.periodId });
        costUsd = Number(res.total) || 0;
        const newExpiry = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
        await supabaseAdmin.from("proxy_stock").update({ expires_at: newExpiry }).in("id", stockIds);
        await supabaseAdmin
          .from("provider_orders")
          .update({ expires_at: newExpiry, purchased_at: new Date().toISOString() })
          .eq("id", block.id);
      }
      out.blocks_renewed++;
      out.ips_renewed += externalIds.length;
      out.cost_usd += costUsd;
      out.details.push({
        block: block.id,
        country: block.country_code,
        occupancy,
        block_size: blockSize,
        action: "renewed",
        cost_usd: costUsd,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.errors.push(`${block.id}: ${msg}`);
      out.details.push({
        block: block.id,
        country: block.country_code,
        occupancy,
        block_size: blockSize,
        action: "skipped",
        reason: "renewal failed; same IPs preserved for manual retry",
      });
      // Alerta por bloco — dedupe diário, então repete todo dia até resolver.
      void notifyAllAdmins({
        title: "🛑 Falha ao renovar bloco — AÇÃO NECESSÁRIA",
        body: `Bloco ${block.id.slice(0, 8)} (${block.country_code ?? "?"}, ${occupancy} cliente(s) ativos) NÃO foi renovado: ${msg}. Mantive os mesmos IPs; resolva saldo/provedor e rode a renovação novamente.`,
        link: "/admin/inventory",
        metadata: { blockId: block.id, country: block.country_code, occupancy, error: msg, sameIpPreserved: true },
        dedupeKey: `renewal-fail:${block.id}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
  }

  await supabaseAdmin.from("audit_log").insert({
    action: dryRun ? "proxyseller.renewal_sweep.dry_run" : "proxyseller.renewal_sweep",
    source: "cron",
    status: out.errors.length ? "error" : "ok",
    response: out as never,
  });

  if (!dryRun && (out.blocks_renewed > 0 || out.blocks_abandoned > 0)) {
    void notifyAllAdmins({
      title: "♻️ Renovação de blocos",
      body: `${out.blocks_renewed} bloco(s) renovado(s) (US$ ${out.cost_usd.toFixed(2)}) · ${out.blocks_abandoned} abandonado(s) (~US$ ${out.cost_saved_usd_estimate.toFixed(2)} economizados).`,
      link: "/admin/inventory",
      metadata: out as never,
      dedupeKey: `renewal-sweep:${new Date().toISOString().slice(0, 10)}`,
    });
  }

  if (!dryRun && out.errors.length > 0) {
    void notifyAllAdmins({
      title: `🛑 Renovação com ${out.errors.length} falha(s) — AÇÃO NECESSÁRIA`,
      body: `${out.errors.length} bloco(s) não renovaram. Ver detalhes em /admin/inventory. Alerta se repete a cada varredura até resolver.`,
      link: "/admin/inventory",
      metadata: { errors: out.errors } as never,
      dedupeKey: `renewal-errors:${new Date().toISOString().slice(0, 10)}`,
    });
  }

  return out;
}

// ─────────────────────── Fulfillment sweep ───────────────────────

/**
 * Varre pedidos `paid` que ainda não têm todos os proxies alocados e re-tenta
 * `allocateProxiesForOrder`. Roda a cada 5 min. Serve para:
 *  - retomar automaticamente após falha temporária (saldo ProxySeller, timeout, etc.)
 *  - alocar pedidos que ficaram pending aguardando IPs do provedor
 *  - alertar admin quando pedido pago está há mais de X minutos sem proxy
 */
export async function runFulfillmentSweep(opts: { alertAfterMinutes?: number } = {}): Promise<{
  scanned: number;
  fulfilled: number;
  still_short: number;
  errors: Array<{ order_id: string; error: string }>;
  alerts_sent: number;
}> {
  const alertAfterMs = (opts.alertAfterMinutes ?? 10) * 60_000;
  const out = {
    scanned: 0,
    fulfilled: 0,
    still_short: 0,
    errors: [] as Array<{ order_id: string; error: string }>,
    alerts_sent: 0,
  };

  // Pedidos paid nos últimos 7 dias (janela ampla; se ficou muito antigo já é caso perdido)
  const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("id, quantity, product_id, created_at, customer_email, products(block_size)")
    .eq("status", "paid")
    .gte("created_at", since);

  for (const order of orders ?? []) {
    const blockSize = (order as { products?: { block_size?: number } | null }).products?.block_size ?? 1;
    const needed = (order.quantity ?? 1) * blockSize;

    const { count: allocated } = await supabaseAdmin
      .from("customer_proxies")
      .select("*", { count: "exact", head: true })
      .eq("order_id", order.id)
      .eq("status", "active");

    if ((allocated ?? 0) >= needed) continue;
    out.scanned++;

    try {
      const result = await allocateProxiesForOrder(order.id);
      if (result.short === 0) {
        out.fulfilled++;
      } else {
        out.still_short++;
        const ageMs = Date.now() - new Date(order.created_at).getTime();
        if (ageMs > alertAfterMs) {
          // Cliente esperando há mais que o limite → alerta destacado por pedido, re-arma por hora
          void notifyAllAdmins({
            title: "⏱️ Cliente PAGO SEM PROXY — AÇÃO NECESSÁRIA",
            body: `${order.customer_email ?? order.id.slice(0, 8)} pagou há ${Math.floor(ageMs / 60000)} min e ainda não recebeu ${needed} IP(s). Erro: ${result.error ?? "estoque esgotado / compra pendente"}. Alerta se repete a cada hora até resolver.`,
            link: `/admin/orders/${order.id}`,
            metadata: { orderId: order.id, needed, allocated: allocated ?? 0, error: result.error ?? null } as never,
            dedupeKey: `fulfillment-stuck:${order.id}:${Math.floor(Date.now() / 3600000)}`,
          });
          out.alerts_sent++;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.errors.push({ order_id: order.id, error: msg });
    }
  }

  if (out.scanned > 0) {
    await supabaseAdmin.from("audit_log").insert({
      action: "fulfillment_sweep",
      source: "cron",
      status: out.errors.length ? "error" : "ok",
      response: out as never,
    });
  }

  return out;
}

/**
 * Checks manual-stock products (source_mode='stock') and pings admins via PWA
 * push when the available pool falls below the product's min_stock rule
 * (default 10). Deduped to at most one alert per product per 6h window.
 * Called from fulfillment-sweep so it piggybacks the minute-by-minute cron.
 */
export async function checkManualStockLow(): Promise<{ checked: number; alerted: number }> {
  const out = { checked: 0, alerted: 0 };
  const { data: settings } = await supabaseAdmin
    .from("provider_settings")
    .select("source_mode")
    .eq("provider", "fastproxy_vps")
    .maybeSingle();
  const mode = (settings as { source_mode?: string } | null)?.source_mode ?? "api";
  if (mode !== "stock") return out;

  const { data: products } = await supabaseAdmin
    .from("products")
    .select("id, name, category, country_code")
    .eq("provider", "fastproxy_vps")
    .eq("active", true);

  for (const p of products ?? []) {
    out.checked++;
    const { count } = await supabaseAdmin
      .from("proxy_stock")
      .select("*", { count: "exact", head: true })
      .eq("product_id", p.id)
      .is("provider_order_id", null)
      .eq("status", "available");
    const available = count ?? 0;

    const { data: rule } = await supabaseAdmin
      .from("restock_rules")
      .select("min_stock")
      .eq("product_id", p.id)
      .maybeSingle();
    const minStock = (rule as { min_stock?: number } | null)?.min_stock ?? 10;

    if (available >= minStock) continue;

    const bucket = Math.floor(Date.now() / (6 * 3600_000));
    await notifyAllAdmins({
      title: "📦 Estoque manual baixo",
      body: `${p.name ?? p.id.slice(0, 8)} (${p.country_code ?? "?"}): ${available} IPs disponíveis (mínimo ${minStock}). Adicione mais em /admin/vps.`,
      link: "/admin/vps",
      metadata: { productId: p.id, available, minStock },
      dedupeKey: `manual-stock-low:${p.id}:${bucket}`,
    });
    out.alerted++;
  }
  return out;
}


