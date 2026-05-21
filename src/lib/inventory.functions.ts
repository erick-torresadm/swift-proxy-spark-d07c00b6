import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/supabase-custom/auth-middleware";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { getBalance, safe } from "./proxyseller.server";
import { computePricingSnapshots } from "./pricing.server";
import { getUsdBrl } from "./fx.server";
import { z } from "zod";

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

    const apiConfigured = !!process.env.PROXYSELLER_API_KEY;

    const balance = apiConfigured ? await safe(() => getBalance()) : null;
    const fx = await safe(() => getUsdBrl());

    const [settingsRes, snapshotsRes, recentCallsRes, healthRes] = await Promise.all([
      supabaseAdmin
        .from("provider_settings")
        .select("min_balance_usd, alert_email, auto_purchase_enabled")
        .eq("provider", "proxyseller")
        .maybeSingle(),
      supabaseAdmin
        .from("provider_balance_snapshots")
        .select("balance_usd, fetched_at")
        .eq("provider", "proxyseller")
        .order("fetched_at", { ascending: false })
        .limit(30),
      supabaseAdmin
        .from("audit_log")
        .select("id, action, status, created_at")
        .eq("source", "proxy_seller")
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("proxy_health_events")
        .select("id, event, detected_at, details, external_proxy_id")
        .is("resolved_at", null)
        .order("detected_at", { ascending: false })
        .limit(50),
    ]);

    const balanceUsd =
      balance && balance.ok ? Number((balance.data as any)?.summ ?? 0) : null;
    const rate = fx.ok ? fx.data.rate : null;

    return {
      api_configured: apiConfigured,
      balance_usd: balanceUsd,
      balance_brl: balanceUsd != null && rate != null ? balanceUsd * rate : null,
      balance_error: balance && !balance.ok ? balance.error : null,
      fx_rate: rate,
      fx_source: fx.ok ? fx.data.source : null,
      fx_fetched_at: fx.ok ? fx.data.fetched_at : null,
      settings: settingsRes.data ?? null,
      snapshots: snapshotsRes.data ?? [],
      recent_calls: (recentCallsRes.data ?? []).map((r) => ({
        id: r.id,
        action: r.action,
        status: r.status ?? "",
        created_at: r.created_at,
      })),
      health_events: healthRes.data ?? [],
    };
  });

export const getPricingSnapshots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return await computePricingSnapshots();
  });

const upsertPricingRuleInput = z.object({
  product_id: z.string().uuid(),
  markup_pct: z.number().min(0).max(10000),
  min_margin_pct: z.number().min(0).max(100),
});

export const upsertPricingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertPricingRuleInput.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("pricing_rules")
      .upsert(
        {
          product_id: data.product_id,
          markup_pct: data.markup_pct,
          min_margin_pct: data.min_margin_pct,
        } as never,
        { onConflict: "product_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const providerSettingsInput = z.object({
  min_balance_usd: z.number().min(0).max(100000),
  alert_email: z.string().email().nullable().optional(),
  auto_purchase_enabled: z.boolean(),
});

export const updateProviderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => providerSettingsInput.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("provider_settings")
      .update({
        min_balance_usd: data.min_balance_usd,
        alert_email: data.alert_email ?? null,
        auto_purchase_enabled: data.auto_purchase_enabled,
      } as never)
      .eq("provider", "proxyseller");
    if (error) throw new Error(error.message);
    return { ok: true };
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
