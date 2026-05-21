import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { listProxies, type PsProxyKind } from "@/lib/proxyseller.server";

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
    .select("id, external_proxy_id, expires_at, status, country_code")
    .in("status", ["allocated", "available"]);

  if (!stockRows || stockRows.length === 0) return 0;

  // 2. Busca lista de proxies vivos no provedor (uma chamada por kind)
  const kinds: PsProxyKind[] = ["ipv4", "ipv6", "isp", "mobile"];
  const providerAlive = new Set<string>();
  const providerStart = Date.now();
  let providerLatency = 0;

  for (const kind of kinds) {
    try {
      const t0 = Date.now();
      const list = await listProxies(kind);
      providerLatency = Math.max(providerLatency, Date.now() - t0);
      for (const p of list) {
        if (p.id) providerAlive.add(String(p.id));
      }
    } catch {
      // ignora: alguns kinds podem não estar habilitados
    }
  }
  const totalProviderLatency = Date.now() - providerStart;

  // 3. Gera snapshots
  const now = Date.now();
  const snapshots = stockRows.map((r) => {
    const ext = r.external_proxy_id ?? "";
    const aliveAtProvider = ext ? providerAlive.has(ext) : true; // sem id externo, considera ok
    const expired = r.expires_at ? new Date(r.expires_at).getTime() < now : false;
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
  });

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
