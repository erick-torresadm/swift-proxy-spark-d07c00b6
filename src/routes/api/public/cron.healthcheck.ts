import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { listProxies, psDateToIso, type PsProxyItem, type PsProxyKind } from "@/lib/proxyseller.server";
import * as vps from "@/lib/fastproxy-vps.server";
import { checkCronAuth } from "@/lib/cron-auth.server";


/**
 * Healthcheck periódico chamado por pg_cron a cada 5 minutos.
 * Para cada stock allocated/available, registra um snapshot em proxy_metrics.
 *
 * Fonte da verdade: API do provedor (proxyseller).
 * - ok = proxy presente no provedor + não expirado.
 * - source = 'provider' (latency_ms reflete o tempo de resposta da API do provedor).
 */
export const Route = createFileRoute("/api/public/cron/healthcheck")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;
        const started = Date.now();
        const inserted: number = await runHealthcheck();
        return Response.json({
          ok: true,
          inserted,
          took_ms: Date.now() - started,
        });
      },
      GET: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;
        const started = Date.now();
        const inserted = await runHealthcheck();
        return Response.json({ ok: true, inserted, took_ms: Date.now() - started });
      },
    },
  },
});

async function runHealthcheck(): Promise<number> {
  // 1. Pega todos os proxies do estoque ainda em uso (allocated) ou disponíveis
  const { data: stockRows } = await supabaseAdmin
    .from("proxy_stock")
    .select("id, external_proxy_id, host, port, username, password, protocol, expires_at, status, country_code")
    .in("status", ["allocated", "available"]);

  if (!stockRows || stockRows.length === 0) return 0;

  // 2. Busca lista de proxies vivos no provedor (uma chamada por kind)
  const kinds: PsProxyKind[] = ["ipv4", "ipv6", "isp", "mobile"];
  const providerById = new Map<string, PsProxyItem>();
  const providerByEndpoint = new Map<string, PsProxyItem>();
  const providerStart = Date.now();
  let providerLatency = 0;

  for (const kind of kinds) {
    try {
      const t0 = Date.now();
      const list = await listProxies(kind);
      providerLatency = Math.max(providerLatency, Date.now() - t0);
      for (const p of list) {
        if (p.id) providerById.set(String(p.id), p);
        const key = endpointKey(p.ip_only || p.ip, p.port_http);
        if (key) providerByEndpoint.set(key, p);
      }
    } catch {
      // ignora: alguns kinds podem não estar habilitados
    }
  }
  const totalProviderLatency = Date.now() - providerStart;

  // 3. Gera snapshots
  const now = Date.now();
  const snapshots = await Promise.all(stockRows.map(async (r) => {
    const ext = r.external_proxy_id ?? "";
    const endpoint = endpointKey(r.host, r.port);
    const providerMatch = (ext ? providerById.get(ext) : undefined) ?? (endpoint ? providerByEndpoint.get(endpoint) : undefined);

    if (providerMatch) {
      const nextHost = hostOnly(providerMatch.ip_only || providerMatch.ip);
      const nextExpiry = psDateToIso(providerMatch.date_end);
      const patch: Record<string, unknown> = {};
      if (providerMatch.id && providerMatch.id !== r.external_proxy_id) patch.external_proxy_id = providerMatch.id;
      if (nextHost && nextHost !== r.host) patch.host = nextHost;
      if (providerMatch.port_http && providerMatch.port_http !== r.port) patch.port = providerMatch.port_http;
      if (providerMatch.login && providerMatch.login !== r.username) patch.username = providerMatch.login;
      if (providerMatch.password && providerMatch.password !== r.password) patch.password = providerMatch.password;
      if (providerMatch.protocol && providerMatch.protocol.toLowerCase() !== r.protocol) patch.protocol = providerMatch.protocol.toLowerCase();
      if (nextExpiry && (!r.expires_at || new Date(nextExpiry).getTime() !== new Date(r.expires_at).getTime())) patch.expires_at = nextExpiry;
      if (Object.keys(patch).length > 0) {
        await supabaseAdmin.from("proxy_stock").update(patch as never).eq("id", r.id);
      }
    }

    const aliveAtProvider = !!providerMatch || !ext; // sem id externo, considera ok
    const effectiveExpiry = providerMatch ? psDateToIso(providerMatch.date_end) : r.expires_at;
    const expired = effectiveExpiry ? new Date(effectiveExpiry).getTime() < now : false;
    const ok = aliveAtProvider && !expired;
    return {
      stock_id: r.id,
      ok,
      latency_ms: providerLatency || null,
      country_seen: r.country_code ?? null,
      source: "provider",
      error: !ok
        ? expired
          ? "expired"
          : !aliveAtProvider
            ? "not_in_provider_inventory"
            : null
        : null,
    };
  }));

  // 4. Insere em batch
  const { error } = await supabaseAdmin.from("proxy_metrics").insert(snapshots);
  if (error) {
    console.error("[healthcheck] insert failed", error.message);
  }

  // 5. Registra latência média global
  await supabaseAdmin.from("audit_log").insert({
    source: "cron",
    action: "proxy_healthcheck",
    status: error ? "error" : "ok",
    request: { stocks: stockRows.length, provider_latency_ms: totalProviderLatency },
    response: { inserted: snapshots.length, error: error?.message ?? null },
  });

  return snapshots.length;
}

function endpointKey(host: string | null | undefined, port: number | string | null | undefined): string | null {
  const cleanHost = hostOnly(host);
  if (!cleanHost || port === null || port === undefined) return null;
  return `${cleanHost}:${String(port)}`;
}

function hostOnly(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end > 0 ? value.slice(1, end) : value.replace(/^\[|\]$/g, "");
  }
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(value)) {
    return value.split(":")[0] ?? value;
  }
  return value.replace(/^\[|\]$/g, "");
}
