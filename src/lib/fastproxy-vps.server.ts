/**
 * Fastproxy VPS adapter (self-hosted IPv6 BR).
 *
 * Server-only HTTP client for the REAL API running on our VPS
 * (fastproxy_api.py). Contract confirmed directly on the server:
 *   Auth:   header  X-API-Key: <FASTPROXY_VPS_API_TOKEN>
 *   POST   /stock/generate  { count, days?, bandwidth? } → N novos proxies
 *          (patch_expand_stock.py; se ainda não aplicado no servidor, cai
 *          de volta em N chamadas a POST /users)
 *   POST   /users            { username, password, block_id? }
 *   POST   /users/<u>/reactivate
 *   DELETE /users/<u>                     → bloqueia (mantém no banco)
 *   GET    /health
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

const DEFAULT_VPS_API_URL = "http://147.15.47.249:8888";

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  try {
    return new URL(trimmed).toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_VPS_API_URL;
  }
}

function baseUrl(): string {
  const raw = process.env.FASTPROXY_VPS_API_URL;
  if (!raw) return DEFAULT_VPS_API_URL;
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
          "X-API-Key": token(),
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

// ─────────────────────── Stock generation (real contract) ───────────────────────

type StockGenerateResponse = {
  status?: string;
  requested?: number;
  created?: number;
  active_users?: number;
  proxies?: Array<{
    username: string;
    password: string;
    port: number;
    ipv6: string;
    protocol?: string;
    proxy_format?: string;
  }>;
};

type UserCreateResponse = {
  status?: string;
  username?: string;
  password?: string;
  port?: number;
  ipv6?: string;
  proxy_format?: string;
};

function randomAlnum(len: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/**
 * Creates `size` new dedicated proxies. Tries the batch endpoint
 * (POST /stock/generate, from patch_expand_stock.py) first; if the server
 * hasn't been patched yet (404), falls back to `size` individual
 * POST /users calls so purchases keep working either way.
 */
export async function createBlock(input: {
  size?: number;
  duration_days?: number;
  customer_ref?: string;
}): Promise<VpsBlock> {
  const size = input.size ?? 10;
  const blockId = `stock_${Date.now().toString(36)}_${randomAlnum(4)}`;

  try {
    const res = await vpsCall<StockGenerateResponse>("POST", "/stock/generate", {
      count: size,
      days: input.duration_days ?? null,
    });
    const proxies: VpsProxy[] = (res.proxies ?? []).map((p) => ({
      ip: p.ipv6,
      port: p.port,
      username: p.username,
      password: p.password,
      protocol: p.protocol ?? "socks5",
      block_id: blockId,
    }));
    return { id: blockId, size: proxies.length, proxies };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/404/.test(msg)) throw e;
  }

  // Fallback: /stock/generate not deployed yet — create one by one via /users.
  const proxies: VpsProxy[] = [];
  for (let i = 0; i < size; i++) {
    const username = `fps_${randomAlnum(10)}`;
    const password = randomAlnum(14);
    const created = await vpsCall<UserCreateResponse>("POST", "/users", {
      username,
      password,
      block_id: blockId,
    });
    if (!created.port || !created.ipv6) continue;
    proxies.push({
      ip: created.ipv6,
      port: created.port,
      username,
      password,
      protocol: "socks5",
      block_id: blockId,
    });
  }
  return { id: blockId, size: proxies.length, proxies };
}

// ─────────────────────── Credentials (mapped onto /users) ───────────────────────

/** Reativa um usuário já existente na VPS; se não existir mais, cria de novo. */
export async function upsertCredential(input: {
  username: string;
  password: string;
  block_id?: string | null;
}): Promise<{ ok?: boolean }> {
  try {
    await vpsCall<{ status?: string }>(
      "POST",
      `/users/${encodeURIComponent(input.username)}/reactivate`,
    );
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/404/.test(msg)) throw e;
  }
  await vpsCall<UserCreateResponse>("POST", "/users", {
    username: input.username,
    password: input.password,
    block_id: input.block_id ?? null,
  });
  return { ok: true };
}

export async function suspendCredential(username: string): Promise<{ ok?: boolean }> {
  await vpsCall<{ status?: string }>(
    "DELETE",
    `/users/${encodeURIComponent(username)}`,
  );
  return { ok: true };
}

// ─────────────────────── Blocks (synthetic, grouped by block_id over /users) ───────────────────────
// A API real não tem conceito de "block" — cada linha é um usuário 3proxy
// independente com seu próprio username/password/port/ipv6/expires_at. Um
// "block" aqui é só o conjunto de usuários que compartilham o mesmo
// block_id (atribuído na criação via createBlock/vpsPurchaseIntoStock).

type RawVpsUser = {
  username: string;
  password?: string | null;
  block_id?: string | null;
  port?: number | null;
  ipv6?: string | null;
  active?: boolean;
  created_at?: string | null;
  expires_at?: string | null;
};

async function listUsersRaw(): Promise<RawVpsUser[]> {
  const res = await vpsCall<RawVpsUser[] | { users?: RawVpsUser[] }>("GET", "/users");
  return Array.isArray(res) ? res : (res?.users ?? []);
}

function usersToBlock(id: string, users: RawVpsUser[]): VpsBlock {
  const proxies: VpsProxy[] = users
    .filter((u) => u.port && u.ipv6)
    .map((u) => ({
      ip: u.ipv6 as string,
      port: u.port as number,
      username: u.username,
      password: u.password ?? null,
      protocol: "socks5",
      block_id: id,
    }));
  return {
    id,
    size: proxies.length,
    occupancy: proxies.length,
    expires_at: users.find((u) => u.expires_at)?.expires_at ?? null,
    created_at: users.find((u) => u.created_at)?.created_at ?? null,
    proxies,
  };
}

export async function listBlocks(): Promise<VpsBlock[]> {
  const users = await listUsersRaw();
  const byBlock = new Map<string, RawVpsUser[]>();
  for (const u of users) {
    const id = u.block_id ?? u.username;
    if (!byBlock.has(id)) byBlock.set(id, []);
    byBlock.get(id)!.push(u);
  }
  return Array.from(byBlock.entries()).map(([id, us]) => usersToBlock(id, us));
}

export async function getBlock(id: string): Promise<VpsBlock> {
  const users = (await listUsersRaw()).filter((u) => (u.block_id ?? u.username) === id);
  return usersToBlock(id, users);
}

export async function renewBlock(id: string, days = 30): Promise<VpsBlock> {
  const users = (await listUsersRaw()).filter((u) => (u.block_id ?? u.username) === id);
  for (const u of users) {
    await vpsCall<{ status?: string }>(
      "POST",
      `/users/${encodeURIComponent(u.username)}/renew`,
      { days },
    );
  }
  return getBlock(id);
}

export async function cancelBlock(id: string): Promise<{ ok?: boolean }> {
  const users = (await listUsersRaw()).filter((u) => (u.block_id ?? u.username) === id);
  for (const u of users) {
    await vpsCall<{ status?: string }>("DELETE", `/users/${encodeURIComponent(u.username)}`);
  }
  return { ok: true };
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
