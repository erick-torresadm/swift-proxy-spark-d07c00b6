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
export type Ipv6BrSource = "stock" | "vps" | "proxyseller";
export type ProxySellerSource = "api" | "stock";

// Slugs cobertos pelo toggle IPv6 BR (VPS própria vs ProxySeller vs Estoque).
const IPV6_BR_SLUGS = ["ipv6-br", "ipv6-fb-br"] as const;

export type VpsStatus = {
  enabled: boolean;
  sourceMode: VpsSourceMode;               // legacy: fastproxy_vps.source_mode
  ipv6BrSource: Ipv6BrSource;              // efeito real p/ família IPv6 BR
  proxysellerSource: ProxySellerSource;    // efeito real p/ IPv4/ISP/USA
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
      .select("dry_run, source_mode")
      .eq("provider", "fastproxy_vps")
      .maybeSingle();

    const { data: dbBlocksRaw } = await supabaseAdmin
      .from("provider_orders")
      .select("id, external_order_id, expires_at, quantity, status, created_at")
      .eq("provider", "fastproxy_vps")
      .order("created_at", { ascending: false })
      .limit(50);

    const s = settings as { dry_run?: boolean; source_mode?: string } | null;
    const enabled = !(s?.dry_run ?? true);
    const sourceMode: VpsSourceMode = s?.source_mode === "stock" ? "stock" : "api";
    return {
      enabled,
      sourceMode,
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

export const setVpsSourceMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { mode: VpsSourceMode }) => {
    if (d.mode !== "api" && d.mode !== "stock") throw new Error("mode inválido");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    const { error } = await supabaseAdmin
      .from("provider_settings")
      .upsert(
        { provider: "fastproxy_vps", source_mode: data.mode } as never,
        { onConflict: "provider" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, mode: data.mode };
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

// ─────────────────────── Manual stock (source_mode='stock') ───────────────────────

export type ParsedProxyLine = {
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  raw: string;
};

/**
 * Tolerant parser: accepts one proxy per line, in any of:
 *   host:port
 *   host:port:user:pass
 *   user:pass@host:port
 *   host,port,user,pass  (comma or semicolon separated)
 * Ignores blank lines and lines starting with '#'.
 */
export function parseManualProxyList(input: string): { rows: ParsedProxyLine[]; errors: string[] } {
  const rows: ParsedProxyLine[] = [];
  const errors: string[] = [];
  const lines = input.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    let host: string | null = null;
    let port: number | null = null;
    let user: string | null = null;
    let pass: string | null = null;

    if (line.includes("@")) {
      const [creds, hostPort] = line.split("@");
      const [u, p] = creds.split(":");
      const [h, prt] = hostPort.split(":");
      user = u ?? null; pass = p ?? null;
      host = h ?? null; port = prt ? Number(prt) : null;
    } else {
      const parts = line.split(/[:,;\s]+/).filter(Boolean);
      if (parts.length >= 2) {
        host = parts[0];
        port = Number(parts[1]);
        if (parts.length >= 4) { user = parts[2]; pass = parts[3]; }
      }
    }

    if (!host || !port || Number.isNaN(port) || port < 1 || port > 65535) {
      errors.push(`inválido: "${line}"`);
      continue;
    }
    rows.push({ host, port, username: user, password: pass, raw: line });
  }
  return { rows, errors };
}

export const importManualStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    product_id: string;
    raw: string;
    protocol?: string;
    duration_days?: number;
    default_username?: string;
    default_password?: string;
  }) => {
    if (!d.product_id) throw new Error("product_id obrigatório");
    if (!d.raw || !d.raw.trim()) throw new Error("cole a lista de IPs");
    return {
      product_id: d.product_id,
      raw: d.raw,
      protocol: (d.protocol || "http").toLowerCase(),
      duration_days: Math.max(1, Math.min(3650, Math.floor(d.duration_days ?? 30))),
      default_username: d.default_username?.trim() || null,
      default_password: d.default_password?.trim() || null,
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");

    const { data: product, error: pErr } = await supabaseAdmin
      .from("products")
      .select("id, provider, country_code")
      .eq("id", data.product_id)
      .maybeSingle();
    if (pErr || !product) throw new Error("Produto não encontrado");
    if (product.provider !== "fastproxy_vps") {
      throw new Error("Produto não é fastproxy_vps");
    }

    const { rows: parsed, errors: parseErrors } = parseManualProxyList(data.raw);
    if (parsed.length === 0) {
      return { ok: false, inserted: 0, duplicates: 0, invalid: parseErrors.length, errors: parseErrors };
    }

    // Deduplicate against existing rows (host+port for this product)
    const { data: existingRaw } = await supabaseAdmin
      .from("proxy_stock")
      .select("host, port")
      .eq("product_id", product.id);
    const existing = new Set((existingRaw ?? []).map((r) => `${r.host}:${r.port}`));

    // Also dedupe within the incoming batch
    const seen = new Set<string>();
    const toInsert: Array<Record<string, unknown>> = [];
    let duplicates = 0;
    const expiresAt = new Date(Date.now() + data.duration_days * 86400 * 1000).toISOString();

    for (const p of parsed) {
      const key = `${p.host}:${p.port}`;
      if (existing.has(key) || seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      toInsert.push({
        product_id: product.id,
        provider_order_id: null,
        external_proxy_id: `manual:${p.host}:${p.port}`,
        host: p.host,
        port: p.port,
        username: p.username ?? data.default_username,
        password: p.password ?? data.default_password,
        protocol: data.protocol,
        country_code: product.country_code,
        status: "available" as const,
        expires_at: expiresAt,
      });
    }

    let inserted = 0;
    if (toInsert.length > 0) {
      const { error: sErr, count } = await supabaseAdmin
        .from("proxy_stock")
        .insert(toInsert as never, { count: "exact" });
      if (sErr) throw new Error(`proxy_stock insert: ${sErr.message}`);
      inserted = count ?? toInsert.length;
    }

    await supabaseAdmin.from("audit_log").insert({
      source: "vps_manual_stock",
      action: "import",
      status: "ok",
      request: {
        product_id: product.id,
        submitted: parsed.length,
        duration_days: data.duration_days,
      } as never,
      response: { inserted, duplicates, invalid: parseErrors.length } as never,
    } as never);

    return { ok: true, inserted, duplicates, invalid: parseErrors.length, errors: parseErrors };
  });

export type ManualStockRow = {
  id: string;
  product_id: string;
  product_name: string | null;
  host: string;
  port: number;
  username: string | null;
  protocol: string | null;
  country_code: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
};

export const listManualStock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManualStockRow[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    const { data } = await supabaseAdmin
      .from("proxy_stock")
      .select("id, product_id, host, port, username, protocol, country_code, status, expires_at, created_at, products(name)")
      .is("provider_order_id", null)
      .order("created_at", { ascending: false })
      .limit(500);
    return (data ?? []).map((r) => ({
      id: r.id,
      product_id: r.product_id,
      product_name: (r as { products?: { name?: string | null } | null }).products?.name ?? null,
      host: r.host,
      port: r.port,
      username: r.username,
      protocol: r.protocol,
      country_code: r.country_code,
      status: r.status as string,
      expires_at: r.expires_at,
      created_at: r.created_at,
    }));
  });

export const deleteManualStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d.id) throw new Error("id obrigatório");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    // Only allow deleting manual rows that are not currently allocated
    const { data: row } = await supabaseAdmin
      .from("proxy_stock")
      .select("id, status, provider_order_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Estoque não encontrado");
    if ((row as { provider_order_id?: string | null }).provider_order_id) {
      throw new Error("Este IP veio de um fornecedor — não é estoque manual");
    }
    if ((row as { status?: string }).status === "allocated") {
      throw new Error("IP está em uso por um cliente");
    }
    const { error } = await supabaseAdmin.from("proxy_stock").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

