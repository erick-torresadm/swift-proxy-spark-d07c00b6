import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { proxySeller } from "./proxy-seller.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("forbidden");
}

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [
      { count: customers },
      { count: activeProxies },
      { count: stockAvailable },
      { count: stockAllocated },
      { data: orders30d },
      { data: lowStock },
    ] = await Promise.all([
      supabaseAdmin.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "customer"),
      supabaseAdmin.from("customer_proxies").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabaseAdmin.from("proxy_stock").select("*", { count: "exact", head: true }).eq("status", "available"),
      supabaseAdmin.from("proxy_stock").select("*", { count: "exact", head: true }).eq("status", "allocated"),
      supabaseAdmin
        .from("orders")
        .select("amount_cents,status,created_at")
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .in("status", ["paid", "past_due", "grace"]),
      supabaseAdmin
        .from("restock_rules")
        .select("min_stock, batch_quantity, product_id, products!inner(name, slug)")
        .eq("enabled", true),
    ]);

    const revenue30d = (orders30d ?? []).reduce((s, o) => s + (o.amount_cents ?? 0), 0);

    // alerts: products onde available < min_stock
    let alerts = 0;
    for (const rule of lowStock ?? []) {
      const { count } = await supabaseAdmin
        .from("proxy_stock")
        .select("*", { count: "exact", head: true })
        .eq("product_id", rule.product_id)
        .eq("status", "available");
      if ((count ?? 0) < rule.min_stock) alerts++;
    }

    return {
      revenue30d_cents: revenue30d,
      customers: customers ?? 0,
      active_proxies: activeProxies ?? 0,
      stock_available: stockAvailable ?? 0,
      stock_allocated: stockAllocated ?? 0,
      stock_alerts: alerts,
    };
  });

export const getInventoryByProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id, slug, name, category, country_code, block_size, delivery_mode")
      .order("name");

    const rows = await Promise.all(
      (products ?? []).map(async (p) => {
        const [{ count: avail }, { count: alloc }, { data: rule }] = await Promise.all([
          supabaseAdmin
            .from("proxy_stock")
            .select("*", { count: "exact", head: true })
            .eq("product_id", p.id)
            .eq("status", "available"),
          supabaseAdmin
            .from("proxy_stock")
            .select("*", { count: "exact", head: true })
            .eq("product_id", p.id)
            .eq("status", "allocated"),
          supabaseAdmin
            .from("restock_rules")
            .select("min_stock, batch_quantity, enabled")
            .eq("product_id", p.id)
            .maybeSingle(),
        ]);
        return {
          ...p,
          available: avail ?? 0,
          allocated: alloc ?? 0,
          rule: rule ?? null,
        };
      }),
    );
    return rows;
  });

export const getProviderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const balance = await proxySeller.balance();
    const { data: recent } = await supabaseAdmin
      .from("audit_log")
      .select("id, action, status, created_at, response")
      .eq("source", "proxy_seller")
      .order("created_at", { ascending: false })
      .limit(20);
    return {
      api_configured: !!process.env.PROXY_SELLER_API_KEY,
      balance: balance.ok ? balance.data : null,
      balance_error: balance.error ?? null,
      recent_calls: recent ?? [],
    };
  });

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name, phone, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    const enriched = await Promise.all(
      (data ?? []).map(async (p) => {
        const { count } = await supabaseAdmin
          .from("customer_proxies")
          .select("*", { count: "exact", head: true })
          .eq("user_id", p.user_id)
          .eq("status", "active");
        return { ...p, active_proxies: count ?? 0 };
      }),
    );
    return enriched;
  });

export const listAllOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, amount_cents, status, billing_cycle, current_period_end, grace_until, created_at, products(name, slug)")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });
