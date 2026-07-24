/**
 * Cliente HTTP para a API de USUÁRIOS da nossa VPS (3proxy).
 *
 * Contrato (definido na VPS):
 *   Base URL:  http://104.234.186.95    (override: FASTPROXY_VPS_USER_API_URL — passará a https://... quando o domínio estiver pronto)
 *   Auth:      header  X-API-Key: <FASTPROXY_VPS_USER_API_KEY>
 *
 *   GET    /health                                → status + contadores
 *   GET    /users                                 → lista de usuários
 *   POST   /users                                 → cria { username, password, block_id }
 *   DELETE /users/<username>                      → bloqueia (mantém no banco, remove do 3proxy)
 *   POST   /users/<username>/reactivate           → reativa
 *   GET    /audit                                 → últimas ações
 *
 * Ao entregar ao cliente:
 *   socks5://<user>:<pass>@<host>:<port_start>-<port_end>
 */

import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

export type VpsUser = {
  username: string;
  password?: string | null;
  block_id?: string | null;
  active?: boolean;
  created_at?: string | null;
};

export type VpsUserHealth = {
  status?: string;
  active_users?: number;
  proxies?: number;
  ports?: string;
  rotate_ports?: string;
  [k: string]: unknown;
};

const DEFAULT_BASE = "http://104.234.186.95";

function baseUrl(): string {
  const raw = (process.env.FASTPROXY_VPS_USER_API_URL ?? "").trim();
  if (!raw) return DEFAULT_BASE;
  try {
    return new URL(raw).toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_BASE;
  }
}

function apiKey(): string {
  const k = process.env.FASTPROXY_VPS_USER_API_KEY;
  if (!k) throw new Error("FASTPROXY_VPS_USER_API_KEY não configurada");
  return k;
}

async function call<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const started = Date.now();
  let status = 0;
  let parsed: unknown = null;
  let errMsg: string | undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey(),
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
  } catch (e) {
    errMsg = e instanceof Error ? e.message : "fetch failed";
  } finally {
    clearTimeout(timeout);
  }

  try {
    await supabaseAdmin.from("audit_log").insert({
      source: "fastproxy_vps_users",
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
    /* audit best-effort */
  }

  if (errMsg) throw new Error(`fastproxy_vps_users ${path}: ${errMsg}`);
  return parsed as T;
}

export async function vpsUsersHealth(): Promise<VpsUserHealth> {
  return call<VpsUserHealth>("GET", "/health");
}

export async function vpsUsersList(): Promise<VpsUser[]> {
  const res = await call<VpsUser[] | { users?: VpsUser[] }>("GET", "/users");
  return Array.isArray(res) ? res : (res?.users ?? []);
}

export async function vpsUsersCreate(input: {
  username: string;
  password: string;
  block_id?: string | null;
}): Promise<{ status?: string; proxy_format?: string; username?: string }> {
  return call("POST", "/users", input as Record<string, unknown>);
}

export async function vpsUsersBlock(username: string): Promise<{ status?: string }> {
  return call("DELETE", `/users/${encodeURIComponent(username)}`);
}

export async function vpsUsersReactivate(username: string): Promise<{ status?: string }> {
  return call("POST", `/users/${encodeURIComponent(username)}/reactivate`);
}

/** Feature flag: enquanto `dry_run=true` para o provider 'fastproxy_vps_users', nada é enviado à VPS. */
export async function isVpsUserSyncEnabled(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("provider_settings")
    .select("dry_run")
    .eq("provider", "fastproxy_vps_users")
    .maybeSingle();
  return !((data as { dry_run?: boolean } | null)?.dry_run ?? true);
}

export function vpsBaseUrlForClientFormat(): string {
  try {
    const u = new URL(baseUrl());
    return u.hostname; // cliente vê socks5://user:pass@host:30000-30499
  } catch {
    return "104.234.186.95";
  }
}
