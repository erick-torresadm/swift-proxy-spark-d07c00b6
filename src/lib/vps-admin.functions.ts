import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export type VpsSourceMode = "api" | "stock";

export type VpsStatus = {
  enabled: boolean;
  sourceMode: VpsSourceMode;
  apiBaseUrl: string;
  healthOk: boolean;
  healthError: string | null;
  healthJson: string;
  vpsBlocksJson: string;
  dbBlocks: Array<{
    id: string;
    external_order_id: string | null;
    expires_at: string | null;
    quantity: number;
    status: string | null;
    created_at: string;
  }>;
};


export const getVpsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VpsStatus> => {
    await assertAdmin(context.userId);
    const vps = await import("@/lib/fastproxy-vps.server");
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    const apiBaseUrl = vps.getConfiguredVpsApiBaseUrl();

    let healthOk = true;
    let healthError: string | null = null;
    let healthJson = "{}";
    try {
      const h = await vps.getHealth();
      healthJson = JSON.stringify(h);
    } catch (e) {
      healthOk = false;
      healthError = e instanceof Error ? e.message : String(e);
    }

    let vpsBlocksJson = "[]";
    try {
      const bs = await vps.listBlocks();
      vpsBlocksJson = JSON.stringify(bs);
    } catch {
      /* ignore */
    }

    const { data: settings } = await supabaseAdmin
      .from("provider_settings")
      .select("dry_run")
      .eq("provider", "fastproxy_vps")
      .maybeSingle();

    const { data: dbBlocksRaw } = await supabaseAdmin
      .from("provider_orders")
      .select("id, external_order_id, expires_at, quantity, status, created_at")
      .eq("provider", "fastproxy_vps")
      .order("created_at", { ascending: false })
      .limit(50);

    const enabled = !((settings as { dry_run?: boolean } | null)?.dry_run ?? true);
    return {
      enabled,
      apiBaseUrl,
      healthOk,
      healthError,
      healthJson,
      vpsBlocksJson,
      dbBlocks: (dbBlocksRaw ?? []).map((r) => ({
        id: r.id,
        external_order_id: r.external_order_id,
        expires_at: r.expires_at,
        quantity: r.quantity,
        status: r.status as string | null,
        created_at: r.created_at,
      })),
    };
  });

export const setVpsEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { enabled: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    const { error } = await supabaseAdmin
      .from("provider_settings")
      .upsert(
        { provider: "fastproxy_vps", dry_run: !data.enabled } as never,
        { onConflict: "provider" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, enabled: data.enabled };
  });

export type VpsProductOption = {
  id: string;
  slug: string | null;
  name: string | null;
  category: string | null;
  country_code: string | null;
};

export const listVpsProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VpsProductOption[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    const { data } = await supabaseAdmin
      .from("products")
      .select("id, slug, name, category, country_code, provider")
      .eq("provider", "fastproxy_vps")
      .order("slug", { ascending: true });
    return (data ?? []).map((r) => ({
      id: r.id,
      slug: r.slug ?? null,
      name: r.name ?? null,
      category: r.category ?? null,
      country_code: r.country_code ?? null,
    }));
  });

export const issueVpsBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { product_id: string; size: number; duration_days: number }) => {
    if (!d.product_id) throw new Error("product_id obrigatório");
    const size = Math.max(1, Math.min(256, Math.floor(d.size)));
    const days = Math.max(1, Math.min(365, Math.floor(d.duration_days)));
    return { product_id: d.product_id, size, duration_days: days };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const vps = await import("@/lib/fastproxy-vps.server");
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");

    const { data: product, error: pErr } = await supabaseAdmin
      .from("products")
      .select("id, slug, category, country_code, provider")
      .eq("id", data.product_id)
      .maybeSingle();
    if (pErr || !product) throw new Error("Produto não encontrado");
    if (product.provider !== "fastproxy_vps") {
      throw new Error("Produto não é fastproxy_vps");
    }

    const block = await vps.createBlock({
      size: data.size,
      duration_days: data.duration_days,
      customer_ref: `admin:${context.userId}`,
    });

    const proxies = block.proxies ?? [];
    const isReady = proxies.length > 0;

    const { data: provOrder, error: poErr } = await supabaseAdmin
      .from("provider_orders")
      .insert({
        product_id: product.id,
        provider: "fastproxy_vps",
        external_order_id: block.id,
        status: isReady ? "active" : "pending",
        quantity: proxies.length,
        cost_cents: 0,
        country_code: product.country_code,
        triggered_by_order_id: null,
        expires_at: block.expires_at ?? null,
        raw_payload: {
          blockId: block.id,
          size: data.size,
          duration_days: data.duration_days,
          source: "fastproxy_vps",
          issued_by: "admin_manual",
          admin_user_id: context.userId,
        } as never,
      } as never)
      .select("id")
      .maybeSingle();
    if (poErr) throw new Error(`provider_orders insert: ${poErr.message}`);

    if (!isReady) {
      return { ok: true, blockId: block.id, added: 0, pending: true };
    }

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
    const { error: sErr } = await supabaseAdmin.from("proxy_stock").insert(stockRows as never);
    if (sErr) throw new Error(`proxy_stock insert: ${sErr.message}`);

    return { ok: true, blockId: block.id, added: stockRows.length, pending: false };
  });
