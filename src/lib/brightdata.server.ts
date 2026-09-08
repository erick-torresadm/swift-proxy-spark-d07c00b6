/**
 * Bright Data API client (server-only) — segundo fornecedor, em avaliação.
 * Docs: https://docs.brightdata.com/api-reference/account-management-api
 *
 * Base URL: https://api.brightdata.com
 * Auth: Bearer token (API key do Control Panel, role Admin/Ops pra criar zone).
 *
 * Produto de interesse: "ISP Proxies" com plan.pool_ip_type = "static_res".
 * Esse parâmetro é o que garante IP residencial estático de verdade — se
 * omitido a zone vira Datacenter comum. Diferente da ProxySeller, aqui o
 * fornecedor separa isso explicitamente no schema da API, o que é bom sinal,
 * mas ainda não testamos com teste de ASN ao vivo (ip-api.com hosting/mobile)
 * antes de vender pra qualquer cliente — NÃO confiar só na documentação.
 *
 * IMPORTANTE: nenhuma zone real foi criada ainda (decisão do Erick, 2026-09-08:
 * "por enquanto eu não vou fazer a compra"). As funções abaixo existem prontas
 * pra uso, mas createIspZone() cria uma zone de verdade e PODE GERAR COBRANÇA —
 * só chamar com autorização explícita, nunca a partir de um cron/allocation
 * automático sem revisão humana antes desse fornecedor estar validado.
 *
 * IMPORTANTE: never expose this to the client. Server-only.
 */

import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

const BASE = "https://api.brightdata.com";

function getApiKey(): string {
  const key = process.env.BRIGHTDATA_API_KEY;
  if (!key) throw new Error("BRIGHTDATA_API_KEY not configured");
  return key;
}

async function bdCall<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${BASE}${path}`;
  const started = Date.now();
  let status = 0;
  let parsed: unknown = null;
  let text = "";
  let errMsg: string | undefined;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    text = await res.text();
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (status < 200 || status >= 300) {
      const asObj = parsed as { error?: string; message?: string } | null;
      errMsg = asObj?.error ?? asObj?.message ?? `Bright Data ${path} HTTP ${status}: ${text.slice(0, 200)}`;
    }
  } catch (e) {
    errMsg = e instanceof Error ? e.message : "fetch failed";
  }

  try {
    await supabaseAdmin.from("audit_log").insert({
      source: "bright_data",
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

  if (errMsg) throw new Error(errMsg);
  return parsed as T;
}

// ─────────────────────────── Zones ───────────────────────────

export type BdZone = {
  name: string;
  type: string;
  plan?: Record<string, unknown>;
};

/** Lista zones já criadas na conta. Seguro chamar a qualquer momento — só leitura. */
export async function listZones(): Promise<BdZone[]> {
  const data = await bdCall<BdZone[]>("GET", "/zone/get_active_zones");
  return data ?? [];
}

/**
 * Cria uma zone de ISP Proxies com IP residencial estático dedicado.
 * ⚠️ Isso PODE GERAR COBRANÇA na conta Bright Data. Não chamar sem
 * autorização explícita do Erick — não usar em fluxo automático.
 */
export async function createIspZone(opts: {
  name: string;
  country: string; // ISO-3166 minúsculo, ex: "br"
  ips: number; // quantidade de IPs dedicados
}): Promise<unknown> {
  return bdCall("POST", "/zone", {
    zone: { name: opts.name, type: "ISP" },
    plan: {
      type: "static",
      pool_ip_type: "static_res", // essencial: sem isso vira Datacenter comum
      ips_type: "dedicated",
      bandwidth: "unlimited",
      country: opts.country.toLowerCase(),
      ips: opts.ips,
    },
  });
}

/**
 * Lista os IPs alocados a uma zone dedicada (host:port reais, não gateway
 * rotativo) — é isso que permite entregar um host fixo pro cliente, igual
 * já fazemos com ProxySeller/VPS.
 */
export async function getZoneIps(zoneName: string): Promise<unknown> {
  return bdCall("GET", `/zone/${encodeURIComponent(zoneName)}/ips`);
}

/** Remove uma zone (e para a cobrança dela). */
export async function deleteZone(zoneName: string): Promise<unknown> {
  return bdCall("DELETE", `/zone?zone=${encodeURIComponent(zoneName)}`);
}

/**
 * Monta a credencial de conexão pro gateway da zone (formato Bright Data:
 * usuário = brd-customer-<id>-zone-<zone>[-country-<cc>], senha = zone password).
 * Preencher customerId/password reais quando o Erick criar a zone.
 */
export function buildProxyAuth(opts: {
  customerId: string;
  zone: string;
  password: string;
  country?: string;
}): { username: string; password: string; gateway: string } {
  const parts = [`brd-customer-${opts.customerId}`, `zone-${opts.zone}`];
  if (opts.country) parts.push(`country-${opts.country.toLowerCase()}`);
  return {
    username: parts.join("-"),
    password: opts.password,
    gateway: "brd.superproxy.io:33335",
  };
}
