import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { purchaseIpv6Block, psDateToIso } from "./proxyseller.server";

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
    .select("id, block_size, category, country_code, provider_tariff_id")
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

  let remaining = totalNeeded - (existing ?? 0);

  // ───────── 1) Pick available stock first (reuse freed IPs) ─────────
  let { data: pool } = await supabaseAdmin
    .from("proxy_stock")
    .select("id")
    .eq("product_id", product.id)
    .eq("status", "available")
    .limit(remaining);

  let picks = pool ?? [];

  // ───────── 2) If short and IPv6 → auto-purchase from ProxySeller ─────────
  const isIpv6 = product.category === "ipv6" || product.category === "ipv6_fb";
  const stillShort = remaining - picks.length;

  let purchaseError: string | undefined;
  if (stillShort > 0 && isIpv6) {
    try {
      await autoPurchaseIpv6IntoStock(product, stillShort);
      // Re-pick after restock
      const { data: pool2 } = await supabaseAdmin
        .from("proxy_stock")
        .select("id")
        .eq("product_id", product.id)
        .eq("status", "available")
        .limit(remaining);
      picks = pool2 ?? [];
    } catch (e) {
      purchaseError = e instanceof Error ? e.message : String(e);
      console.error("[allocation] auto-purchase IPv6 failed:", e);
      // fall through; we'll just report `short`
    }
  }

  if (picks.length === 0) {
    return { allocated: existing ?? 0, short: remaining, error: purchaseError };
  }

  // Insert allocations
  const rows = picks.map((p) => ({
    user_id: order.user_id as string,
    order_id: order.id,
    stock_id: p.id,
    status: "active" as const,
  }));

  const { error: insErr } = await supabaseAdmin
    .from("customer_proxies")
    .insert(rows);
  if (insErr) throw new Error(insErr.message);

  // Flip stock to allocated
  const ids = picks.map((p) => p.id);
  await supabaseAdmin
    .from("proxy_stock")
    .update({ status: "allocated" })
    .in("id", ids);

  return {
    allocated: (existing ?? 0) + picks.length,
    short: remaining - picks.length,
    error: purchaseError,
  };
}

/**
 * Buys an IPv6 block from ProxySeller and inserts the proxies into stock.
 * Reads ProxySeller config from product.provider_tariff_id as JSON:
 *   { "countryId": 7, "periodId": "30" }
 */
async function autoPurchaseIpv6IntoStock(
  product: {
    id: string;
    provider_tariff_id: string | null;
    country_code: string | null;
  },
  needed: number,
): Promise<void> {
  if (!product.provider_tariff_id) {
    throw new Error(
      `product ${product.id} missing provider_tariff_id (ProxySeller config)`,
    );
  }

  let cfg: { countryId?: number; periodId?: string };
  try {
    cfg = JSON.parse(product.provider_tariff_id);
  } catch {
    throw new Error("invalid provider_tariff_id JSON");
  }
  if (!cfg.countryId || !cfg.periodId) {
    throw new Error("provider_tariff_id must include {countryId, periodId}");
  }

  const result = await purchaseIpv6Block({
    countryId: cfg.countryId,
    periodId: cfg.periodId,
    quantity: needed,
  });

  // Record the provider order
  const { data: provOrder } = await supabaseAdmin
    .from("provider_orders")
    .insert({
      product_id: product.id,
      external_order_id: result.externalOrderId,
      status: "active",
      quantity: result.proxies.length,
      cost_cents: result.costCents,
      country_code: product.country_code,
      raw_payload: { baseOrderNumber: result.baseOrderNumber } as never,
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

  if (stockRows.length === 0) return;
  const { error: stockErr } = await supabaseAdmin
    .from("proxy_stock")
    .insert(stockRows);
  if (stockErr) throw new Error(`stock insert failed: ${stockErr.message}`);
}
