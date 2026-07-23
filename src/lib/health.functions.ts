import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/supabase-custom/auth-middleware";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

/**
 * Resumo de saúde dos proxies do usuário autenticado.
 * Retorna, por stock_id, uptime % e última latência nas últimas 24h e 7d.
 */
export const getMyProxiesHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Pega stock_ids do usuário
    const { data: mine } = await supabaseAdmin
      .from("customer_proxies")
      .select("stock_id")
      .eq("user_id", context.userId)
      .eq("status", "active");

    const stockIds = (mine ?? [])
      .map((r) => r.stock_id)
      .filter((x): x is string => !!x);

    if (stockIds.length === 0) return {} as Record<string, ProxyHealthSummary>;

    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

    const { data: metrics } = await supabaseAdmin
      .from("proxy_metrics")
      .select("stock_id, ts, ok, latency_ms")
      .in("stock_id", stockIds)
      .gte("ts", since7d)
      .order("ts", { ascending: false })
      .limit(5000);

    const summary: Record<string, ProxyHealthSummary> = {};
    for (const id of stockIds) {
      summary[id] = {
        last_ok: null,
        last_check_at: null,
        last_latency_ms: null,
        uptime_24h: null,
        uptime_7d: null,
        samples_24h: 0,
        samples_7d: 0,
      };
    }

    for (const m of metrics ?? []) {
      const s = summary[m.stock_id];
      if (!s) continue;
      if (s.last_check_at === null) {
        s.last_check_at = m.ts;
        s.last_ok = m.ok;
        s.last_latency_ms = m.latency_ms;
      }
      s.samples_7d += 1;
      if (m.ok) {
        s.uptime_7d = (s.uptime_7d ?? 0) + 1;
      }
      if (m.ts >= since24h) {
        s.samples_24h += 1;
        if (m.ok) s.uptime_24h = (s.uptime_24h ?? 0) + 1;
      }
    }

    // Converte contagens em percentual
    for (const id of Object.keys(summary)) {
      const s = summary[id];
      s.uptime_24h =
        s.samples_24h > 0 ? Math.round(((s.uptime_24h ?? 0) / s.samples_24h) * 1000) / 10 : null;
      s.uptime_7d =
        s.samples_7d > 0 ? Math.round(((s.uptime_7d ?? 0) / s.samples_7d) * 1000) / 10 : null;
    }

    return summary;
  });

export type ProxyHealthSummary = {
  last_ok: boolean | null;
  last_check_at: string | null;
  last_latency_ms: number | null;
  uptime_24h: number | null;
  uptime_7d: number | null;
  samples_24h: number;
  samples_7d: number;
};

/**
 * Histórico detalhado de um proxy específico (para o gráfico).
 * Retorna até 288 pontos (24h em intervalos de 5min).
 */
export const getProxyHealthHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ proxyId: z.string().uuid(), window: z.enum(["24h", "7d"]).default("24h") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Verifica posse
    const { data: cp } = await supabaseAdmin
      .from("customer_proxies")
      .select("stock_id")
      .eq("id", data.proxyId)
      .eq("user_id", context.userId)
      .eq("status", "active")
      .maybeSingle();

    if (!cp?.stock_id) return [];

    const since = new Date(
      Date.now() - (data.window === "7d" ? 7 * 24 : 24) * 3600_000,
    ).toISOString();

    const { data: rows } = await supabaseAdmin
      .from("proxy_metrics")
      .select("ts, ok, latency_ms")
      .eq("stock_id", cp.stock_id)
      .gte("ts", since)
      .order("ts", { ascending: true });

    return (rows ?? []).map((r) => ({
      ts: r.ts,
      ok: r.ok,
      latency_ms: r.latency_ms,
    }));
  });
