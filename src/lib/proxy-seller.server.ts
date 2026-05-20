// Wrapper da API Proxy-Seller (https://docs.proxy-seller.com)
// Server-only. Lê PROXY_SELLER_API_KEY de process.env dentro de cada chamada.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BASE = "https://proxy-seller.com/personal/api/v1";

type Json = Record<string, unknown>;

async function request<T = Json>(
  method: "GET" | "POST",
  path: string,
  body?: Json,
): Promise<{ ok: boolean; data: T | null; status: number; error?: string }> {
  const apiKey = process.env.PROXY_SELLER_API_KEY;
  if (!apiKey) {
    return { ok: false, data: null, status: 0, error: "PROXY_SELLER_API_KEY ausente" };
  }
  const url = `${BASE}/${apiKey}${path}`;
  const started = Date.now();
  let status = 0;
  let parsed: T | null = null;
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
      parsed = text ? (JSON.parse(text) as T) : null;
    } catch {
      parsed = text as unknown as T;
    }
    if (!res.ok) errMsg = `HTTP ${status}`;
  } catch (e) {
    errMsg = e instanceof Error ? e.message : "fetch failed";
  }

  // best-effort audit
  void supabaseAdmin.from("audit_log").insert({
    source: "proxy_seller",
    action: `${method} ${path}`,
    status: errMsg ? "error" : "ok",
    request: (body ?? null) as never,
    response: {
      status,
      duration_ms: Date.now() - started,
      body: parsed as unknown,
      error: errMsg ?? null,
    } as never,
  });

  return { ok: !errMsg, data: parsed, status, error: errMsg };
}

// Endpoints (subset relevante)
export const proxySeller = {
  balance: () => request("GET", "/balance"),
  // catálogo
  countries: (kind: "ipv4" | "ipv6" | "isp" | "mobile") => request("GET", `/reference/list/${kind}`),
  tariffs: (kind: "ipv4" | "ipv6" | "isp" | "mobile") => request("GET", `/prices/${kind}`),
  // pedidos
  order: (kind: "ipv4" | "ipv6" | "isp" | "mobile", payload: Json) =>
    request("POST", `/order/make/${kind}`, payload),
  listProxies: (kind: "ipv4" | "ipv6" | "isp" | "mobile") =>
    request("GET", `/proxy/list/${kind}`),
  // renovação
  prolong: (kind: "ipv4" | "ipv6" | "isp" | "mobile", payload: Json) =>
    request("POST", `/order/prolong/${kind}`, payload),
};
