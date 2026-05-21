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

  // Best-effort audit (non-blocking)
  void supabaseAdmin.from("audit_log").insert({
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
 * Buys an IPv6 block from ProxySeller and returns the provisioned proxies.
 * - countryId/periodId come from /reference/list/ipv6
 * - paymentId=1 → uses account balance
 */
export async function purchaseIpv6Block(params: {
  countryId: number;
  periodId: string;
  quantity: number;
  protocol?: "HTTPS" | "SOCKS5";
  targetSectionId?: number;
  targetId?: number;
}): Promise<{
  externalOrderId: string;
  baseOrderNumber: string;
  costCents: number;
  proxies: PsProxyItem[];
}> {
  const order = await psPost<PsOrderMakeData>("/order/make", {
    ...normalizeOrderParams("ipv6", params),
    paymentId: 1,
    authorization: "",
  });

  const baseOrderNumber = order.listBaseOrderNumbers?.[0];
  if (!baseOrderNumber) throw new Error("ProxySeller: no baseOrderNumber returned");

  const list = await psGet<{ items: PsProxyItem[] }>(
    `/proxy/list/ipv6?orderId=${encodeURIComponent(baseOrderNumber)}`,
  );

  return {
    externalOrderId: String(order.orderId),
    baseOrderNumber,
    costCents: Math.round((order.total ?? 0) * 100),
    proxies: list.items ?? [],
  };
}

function normalizeOrderParams(
  kind: PsProxyKind,
  params: Record<string, unknown>,
): Record<string, unknown> {
  if (kind !== "ipv6") return params;
  return {
    ...params,
    protocol: params.protocol ?? "HTTPS",
    targetSectionId: params.targetSectionId ?? 8,
    targetId: params.targetId ?? 1768,
  };
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
  });
  return data.items?.[0] ?? null;
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
