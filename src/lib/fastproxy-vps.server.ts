/**
 * Fastproxy VPS adapter (self-hosted IPv6 BR).
 *
 * Server-only HTTP client for the API running on our own VPS
 * (default: http://104.234.186.95:8888). Auth: Bearer token.
 *
 * Response shapes below are tolerant — the API is small and evolving. We
 * only rely on a couple of well-known fields; unknown fields pass through
 * on the raw payload we persist in provider_orders.raw_payload for audit.
 */

import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

export type VpsProxy = {
  ip: string;
  port: number;
  username?: string | null;
  password?: string | null;
  protocol?: string | null;
  block_id?: string | null;
};

export type VpsBlock = {
  id: string;
  size?: number | null;
  occupancy?: number | null;
  expires_at?: string | null;
  created_at?: string | null;
  proxies?: VpsProxy[];
};

export type VpsHealth = {
  status?: string;
  uptime_seconds?: number;
  blocks?: number;
  proxies?: number;
  [k: string]: unknown;
};

export type VpsAuditEntry = {
  ts?: string;
  action?: string;
  target?: string;
  detail?: unknown;
  [k: string]: unknown;
};

const DIRECT_VPS_API_URL = "http://104.234.186.95:8888";

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === "104.234.186.95") {
      return trimmed;
    }
    return DIRECT_VPS_API_URL;
  } catch {
    return DIRECT_VPS_API_URL;
  }
}

function baseUrl(): string {
  const raw = process.env.FASTPROXY_VPS_API_URL;
  if (!raw) return DIRECT_VPS_API_URL;
  return normalizeBaseUrl(raw);
}

export function getConfiguredVpsApiBaseUrl(): string {
  return baseUrl();
}

function token(): string {
  const t = process.env.FASTPROXY_VPS_API_TOKEN;
  if (!t) throw new Error("FASTPROXY_VPS_API_TOKEN not configured");
  return t;
}

async function vpsCall<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
  opts: { retry5xx?: boolean } = { retry5xx: true },
): Promise<T> {
  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const started = Date.now();
  let status = 0;
  let parsed: unknown = null;
  let errMsg: string | undefined;

  const attempt = async (): Promise<void> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      status = res.status;
      const text = await res.text();
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      if (status >= 400) {
        const asObj = parsed as { error?: string; message?: string } | null;
        errMsg = asObj?.error ?? asObj?.message ?? `HTTP ${status}`;
      }
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    await attempt();
    if (status >= 500 && opts.retry5xx !== false) {
      await new Promise((r) => setTimeout(r, 800));
      await attempt();
    }
  } catch (e) {
    errMsg = e instanceof Error ? e.message : "fetch failed";
  }

  try {
    await supabaseAdmin.from("audit_log").insert({
      source: "fastproxy_vps",
      action: `${method} ${path}`,
      status: errMsg ? "error" : "ok",
      request: (body ?? null) as never,
      response: {
        http_status: status,
        duration_ms: Date.now() - started,
        base_url: baseUrl(),
        body: parsed ?? null,
        error: errMsg ?? null,
      } as never,
    });
  } catch {
    /* ignore audit failure */
  }

  if (errMsg) throw new Error(`fastproxy_vps ${path}: ${errMsg}`);
  return parsed as T;
}

// ─────────────────────── Blocks ───────────────────────

export async function createBlock(input: {
  size?: number;
  duration_days?: number;
  customer_ref?: string;
}): Promise<VpsBlock> {
  const payload = {
    size: input.size ?? 10,
    duration_days: input.duration_days ?? 30,
    customer_ref: input.customer_ref,
  };
  return vpsCall<VpsBlock>("POST", "/blocks", payload);
}

export async function listBlocks(): Promise<VpsBlock[]> {
  const res = await vpsCall<VpsBlock[] | { blocks?: VpsBlock[] }>("GET", "/blocks");
  if (Array.isArray(res)) return res;
  return res?.blocks ?? [];
}

export async function getBlock(id: string): Promise<VpsBlock> {
  return vpsCall<VpsBlock>("GET", `/blocks/${encodeURIComponent(id)}`);
}

export async function renewBlock(id: string, days = 30): Promise<VpsBlock> {
  return vpsCall<VpsBlock>("POST", `/blocks/${encodeURIComponent(id)}/renew`, { days });
}

export async function cancelBlock(id: string): Promise<{ ok?: boolean }> {
  return vpsCall<{ ok?: boolean }>("POST", `/blocks/${encodeURIComponent(id)}/cancel`);
}

// ─────────────────────── Credentials ───────────────────────

export async function upsertCredential(input: {
  username: string;
  password: string;
  block_id?: string | null;
}): Promise<{ ok?: boolean }> {
  return vpsCall<{ ok?: boolean }>("POST", "/credentials", input);
}

export async function suspendCredential(username: string): Promise<{ ok?: boolean }> {
  return vpsCall<{ ok?: boolean }>(
    "DELETE",
    `/credentials/${encodeURIComponent(username)}`,
  );
}

export async function rotateCredential(username: string): Promise<VpsProxy> {
  return vpsCall<VpsProxy>(
    "POST",
    `/credentials/${encodeURIComponent(username)}/rotate`,
  );
}

// ─────────────────────── Meta ───────────────────────

export async function getHealth(): Promise<VpsHealth> {
  return vpsCall<VpsHealth>("GET", "/health", undefined, { retry5xx: false });
}

export async function getAudit(): Promise<VpsAuditEntry[]> {
  const res = await vpsCall<VpsAuditEntry[] | { entries?: VpsAuditEntry[] }>("GET", "/audit");
  if (Array.isArray(res)) return res;
  return res?.entries ?? [];
}

// ─────────────────────── Feature flag ───────────────────────

/**
 * Reads provider_settings.dry_run for the fastproxy_vps row. While `true` the
 * allocation layer should NOT route to the VPS yet — keeps ProxySeller as the
 * source of truth during rollout. Flip via admin `/admin/vps` when ready.
 */
export async function isVpsEnabled(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("provider_settings")
    .select("dry_run")
    .eq("provider", "fastproxy_vps")
    .maybeSingle();
  // dry_run=true → NOT enabled (mirror the naming already used for ProxySeller).
  return !((data as { dry_run?: boolean } | null)?.dry_run ?? true);
}
