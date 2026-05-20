import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Allocates proxies from stock to a paid order.
 * - quantityNeeded = order.quantity * product.block_size
 * - picks `available` proxy_stock rows matching the order's product
 * - inserts into customer_proxies and flips stock status to `allocated`
 * Idempotent: if proxies are already allocated for this order, does nothing.
 */
export async function allocateProxiesForOrder(orderId: string): Promise<{
  allocated: number;
  short: number;
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
    // only allocate paid orders
    return { allocated: 0, short: 0 };
  }

  const { data: product } = await supabaseAdmin
    .from("products")
    .select("id, block_size")
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

  // Pick available stock for this product
  const { data: pool } = await supabaseAdmin
    .from("proxy_stock")
    .select("id")
    .eq("product_id", product.id)
    .eq("status", "available")
    .limit(remaining);

  const picks = pool ?? [];
  if (picks.length === 0) {
    return { allocated: existing ?? 0, short: remaining };
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
  };
}
