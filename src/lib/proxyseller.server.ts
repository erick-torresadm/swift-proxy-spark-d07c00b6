/**
 * ProxySeller API client (server-only).
 * Docs: https://docs.proxy-seller.com/
 *
 * Base URL: https://proxy-seller.com/personal/api/v1/{apiKey}/
 * Auth: API key in URL path.
 * Note: business errors return HTTP 200 with `errors[]` populated.
 *
 * IMPORTANT: never expose this to the client. Server-only.
 */

import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

const BASE = "https://proxy-seller.com/personal/api/v1";

function getApiKey(): string {
  const key = process.env.PROXYSELLER_API_KEY;
  if (!key) throw new Error("PROXYSELLER_API_KEY not configured");
  return key;
}

export type PsResponse<T> = {
  status: "success" | "error";
  data: T | null;
  errors: Array<{ message: string; code: number; customData: unknown }>;
};

async function psCall<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${BASE}/${getApiKey()}${path}`;
  const started = Date.now();
  let status = 0;
  let parsed: PsResponse<T> | null = null;
  let errMsg: string | undefined;

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    const text = await res.text();
    try {
      parsed = text ? (JSON.parse(text) as PsResponse<T>) : null;
    } catch {
      errMsg = `non-JSON response: ${text.slice(0, 200)}`;
    }
    if (parsed && parsed.status !== "success") {
      errMsg = parsed.errors?.[0]?.message ?? `ProxySeller ${path} failed`;
    }
  } catch (e) {
    errMsg = e instanceof Error ? e.message : "fetch failed";
  }

  // Persist audit synchronously to survive Worker lifecycle.
  try {
    await supabaseAdmin.from("audit_log").insert({
      source: "proxy_seller",
      action: `${method} ${path}`,
      status: errMsg ? "error" : "ok",
      request: (body ?? null) as never,
      response: {
        http: status,
        duration_ms: Date.now() - started,
        body: parsed as unknown,
        error: errMsg ?? null,
      } as never,
    });
  } catch {
    // never let audit failure mask the real call result
  }

  if (errMsg || !parsed || !parsed.data) {
    throw new Error(`ProxySeller ${path}: ${errMsg ?? "no data"}`);
  }
  return parsed.data;
}

const psGet = <T>(path: string) => psCall<T>("GET", path);
const psPost = <T>(path: string, body: Record<string, unknown>) => psCall<T>("POST", path, body);

// ─────────────────────────── Balance ───────────────────────────

export async function getBalance(): Promise<{ summ: number }> {
  return psGet("/balance/get");
}

// ─────────────────────────── Reference data ───────────────────────────

export type PsProxyKind = "ipv4" | "ipv6" | "isp" | "mobile";

export async function getReferenceList(kind: PsProxyKind): Promise<unknown> {
  return psGet(`/reference/list/${kind}`);
}

// ─────────────────────────── Order calc (pricing) ───────────────────────────

export type PsOrderCalcResult = {
  total: number; // USD
  currency?: string;
  [k: string]: unknown;
};

/** Dry-run order pricing — returns total cost in USD without buying. */
export async function calcOrder(
  kind: PsProxyKind,
  params: Record<string, unknown>,
): Promise<PsOrderCalcResult> {
  return psPost(`/order/calc`, normalizeOrderParams(kind, params));
}

// ─────────────────────────── Order make ───────────────────────────

export type PsProxyItem = {
  id: string;
  order_id: string;
  order_number: string;
  ip: string;
  ip_only: string;
  protocol: string;
  port_socks: number;
  port_http: number;
  login: string;
  password: string;
  country: string;
  country_alpha3: string;
  date_end: string; // dd.mm.yyyy
};

type PsOrderMakeData = {
  orderId: number;
  total: number;
  listBaseOrderNumbers: string[];
  balance: number;
};

/**
 * Buys a block from ProxySeller and returns the provisioned proxies.
 * Works for any kind (ipv6 / ipv4 / isp / mobile). Params depend on kind.
 * - paymentId=1 → uses account balance
 */
export async function purchaseProxyBlock(
  kind: PsProxyKind,
  params: Record<string, unknown> & { quantity: number },
): Promise<{
  externalOrderId: string;
  baseOrderNumber: string;
  costCents: number;
  proxies: PsProxyItem[];
}> {
  const order = await psPost<PsOrderMakeData>("/order/make", {
    ...normalizeOrderParams(kind, params),
    paymentId: 1,
    authorization: "",
  });

  const baseOrderNumber = order.listBaseOrderNumbers?.[0];
  if (!baseOrderNumber) throw new Error("ProxySeller: no baseOrderNumber returned");

  // ProxySeller provisioning may take seconds to minutes — poll /proxy/list.
  const proxies = await pollProxiesForOrder(baseOrderNumber, params.quantity, undefined, kind);

  return {
    externalOrderId: String(order.orderId),
    baseOrderNumber,
    costCents: Math.round((order.total ?? 0) * 100),
    proxies,
  };
}

/** Back-compat thin wrapper for callers still using the IPv6-specific name. */
export const purchaseIpv6Block = (params: {
  countryId: number;
  periodId: string;
  quantity: number;
  protocol?: "HTTPS" | "SOCKS5";
  targetSectionId?: number;
  targetId?: number;
}) => purchaseProxyBlock("ipv6", params);

/** Poll /proxy/list/{kind}?orderId=… until ≥ expected items or backoff exhausted. */
export async function pollProxiesForOrder(
  baseOrderNumber: string,
  expected: number,
  delaysMs: number[] = [1000, 2000, 4000, 8000, 15000],
  kind: PsProxyKind = "ipv6",
): Promise<PsProxyItem[]> {
  let last: PsProxyItem[] = [];
  for (let i = 0; i < delaysMs.length; i++) {
    await new Promise((r) => setTimeout(r, delaysMs[i]));
    try {
      const list = await psGet<{ items: PsProxyItem[] }>(
        `/proxy/list/${kind}?orderId=${encodeURIComponent(baseOrderNumber)}`,
      );
      last = list.items ?? [];
      if (last.length >= expected) return last;
    } catch {
      // swallow transient errors and try again
    }
  }
  return last;
}

function normalizeOrderParams(
  kind: PsProxyKind,
  params: Record<string, unknown>,
): Record<string, unknown> {
  if (kind === "ipv6") {
    return {
      ...params,
      protocol: params.protocol ?? "HTTPS",
      targetSectionId: params.targetSectionId ?? 8,
      targetId: params.targetId ?? 1768,
    };
  }
  // ipv4 / isp: accept either targetSectionId+targetId OR customTargetName
  return {
    protocol: params.protocol ?? "HTTP",
    ...params,
  };
}

/**
 * Generates fake (but valid-shaped) PsProxyItem rows for dry-run mode.
 * Hosts are RFC 3849 documentation IPv6 (2001:db8::/32) so they never collide
 * with real allocations and are obvious in logs/UI as simulated.
 */
export function generateSimulatedProxies(
  baseOrderNumber: string,
  quantity: number,
  countryCode: string | null,
): PsProxyItem[] {
  const dateEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const dd = String(dateEnd.getUTCDate()).padStart(2, "0");
  const mm = String(dateEnd.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = dateEnd.getUTCFullYear();
  const dateStr = `${dd}.${mm}.${yyyy}`;
  const country = (countryCode || "BR").toUpperCase();

  return Array.from({ length: quantity }, (_, i) => {
    const hex = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
    const host = `2001:db8:dry:${baseOrderNumber.slice(-4)}::${hex.slice(0, 4)}:${hex.slice(4)}`;
    const id = `dry-${baseOrderNumber.slice(-6)}-${i}`;
    return {
      id,
      order_id: baseOrderNumber,
      order_number: baseOrderNumber,
      ip: `[${host}]:30000`,
      ip_only: host,
      protocol: "HTTPS",
      port_socks: 30001,
      port_http: 30000,
      login: `dry_${id}`,
      password: Math.random().toString(36).slice(2, 14),
      country,
      country_alpha3: country.padEnd(3, "X").slice(0, 3),
      date_end: dateStr,
    };
  });
}

// ─────────────────────────── List proxies ───────────────────────────

export async function listProxies(
  kind: PsProxyKind,
  opts?: { orderId?: string },
): Promise<PsProxyItem[]> {
  const qs = opts?.orderId ? `?orderId=${encodeURIComponent(opts.orderId)}` : "";
  const data = await psGet<{ items: PsProxyItem[] }>(`/proxy/list/${kind}${qs}`);
  return data.items ?? [];
}

// ─────────────────────────── Replace / rotate ───────────────────────────

export async function replaceProxyIp(externalProxyId: string): Promise<PsProxyItem | null> {
  const data = await psPost<{ items?: PsProxyItem[] }>("/proxy/replace", {
    ids: [externalProxyId],
    type: "NOT_WORK",
  });
  return data.items?.[0] ?? null;
}

export async function checkProxy(proxy: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE}/${getApiKey()}/tools/proxy/check?proxy=${encodeURIComponent(proxy)}`);
    const parsed = (await res.json()) as PsResponse<unknown>;
    if (parsed.status === "success" && parsed.data) return { ok: true };
    return { ok: false, error: parsed.errors?.[0]?.message ?? "proxy_check_failed" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────── Prolong (extend expiration) ───────────────────────────

export async function prolongCalc(
  kind: PsProxyKind,
  params: { ids: string[]; periodId: string },
): Promise<{ total: number; [k: string]: unknown }> {
  return psPost(`/prolong/calc/${kind}`, { ...params, paymentId: 1 });
}

export async function prolongMake(
  kind: PsProxyKind,
  params: { ids: string[]; periodId: string },
): Promise<{ total: number; [k: string]: unknown }> {
  return psPost(`/prolong/make/${kind}`, { ...params, paymentId: 1 });
}

// ─────────────────────────── Comments ───────────────────────────

export async function setProxyComment(ids: string[], comment: string): Promise<unknown> {
  return psCall("POST", "/proxy/comment/set", { ids, comment });
}

// ─────────────────────────── Helpers ───────────────────────────

/** Parse dd.mm.yyyy → ISO date */
export function psDateToIso(d: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(d);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00Z`;
}

/** Safe wrapper that doesn't throw — returns {ok, data, error}. */
export async function safe<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
