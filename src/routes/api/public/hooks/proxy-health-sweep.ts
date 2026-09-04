/**
 * Testa de verdade (conexão real) os proxies ativos hospedados na nossa VPS
 * e troca automaticamente qualquer um que falhar 2 vezes seguidas, antes que
 * o cliente perceba. Isso existe porque hosts da VPS já morreram silenciosamente
 * (177.54.146.90, 104.234.186.95) e ninguém percebeu por dias — o estoque
 * continuava marcado "allocated" mesmo com o servidor fora do ar.
 *
 * Roda a cada 10 min via pg_cron, testando um lote pequeno por vez
 * (os mais desatualizados primeiro), sempre com no máximo 5 conexões
 * simultâneas por host — 3proxy 0.9.x cai em fork-storm com muita
 * concorrência de uma vez só.
 *
 * Auth: mesmo mecanismo dos outros cron hooks (checkCronAuth).
 */
import { createFileRoute } from "@tanstack/react-router";
import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { enqueueNotification } from "@/lib/notifications.server";
import { notifyAllAdmins } from "@/lib/notifications.server";
import { checkCronAuth } from "@/lib/cron-auth.server";

const FASTPROXY_VPS_HOSTS = ["147.15.47.249"];
const BATCH_SIZE = 30;
const CONCURRENCY = 5;
const CHECK_TIMEOUT_MS = 8000;
const FAILURE_THRESHOLD = 2;

type StockRow = {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  protocol: string;
  consecutive_failures: number;
};

async function testProxy(row: StockRow): Promise<boolean> {
  const auth = `${encodeURIComponent(row.username)}:${encodeURIComponent(row.password)}`;
  const proxyUrl =
    row.protocol === "socks5"
      ? `socks5h://${auth}@${row.host}:${row.port}`
      : `http://${auth}@${row.host}:${row.port}`;
  const agent = row.protocol === "socks5" ? new SocksProxyAgent(proxyUrl) : new HttpsProxyAgent(proxyUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetch("http://ip-api.com/json/?fields=status", {
      // @ts-expect-error -- node fetch aceita agent via dispatcher/agent do undici em runtime node
      agent,
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { status?: string };
    return body.status === "success";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function runBatch<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const item = items[idx++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export const Route = createFileRoute("/api/public/hooks/proxy-health-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;

        const { data: candidates, error } = await supabaseAdmin
          .from("proxy_stock")
          .select("id, host, port, username, password, protocol, consecutive_failures")
          .in("host", FASTPROXY_VPS_HOSTS)
          .eq("status", "allocated")
          .order("last_health_check_at", { ascending: true, nullsFirst: true })
          .limit(BATCH_SIZE);

        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const summary = { checked: candidates?.length ?? 0, failed: 0, swapped: 0 };

        await runBatch(candidates ?? [], CONCURRENCY, async (row) => {
          const alive = await testProxy(row as StockRow);
          const nextFailures = alive ? 0 : ((row as StockRow).consecutive_failures ?? 0) + 1;

          await supabaseAdmin
            .from("proxy_stock")
            .update({
              last_health_check_at: new Date().toISOString(),
              health_status: alive ? "ok" : "dead",
              consecutive_failures: nextFailures,
            })
            .eq("id", row.id);

          if (alive) return;
          summary.failed++;

          if (nextFailures < FAILURE_THRESHOLD) return;

          // Falhou 2x seguidas: acha o dono ativo e troca por estoque saudável.
          const { data: cp } = await supabaseAdmin
            .from("customer_proxies")
            .select("id, user_id")
            .eq("stock_id", row.id)
            .eq("status", "active")
            .maybeSingle();

          const { data: replacement } = await supabaseAdmin
            .from("proxy_stock")
            .select("id")
            .in("host", FASTPROXY_VPS_HOSTS)
            .eq("status", "available")
            .neq("id", row.id)
            .limit(1)
            .maybeSingle();

          if (!replacement) {
            void notifyAllAdmins({
              title: "🛑 Proxy morto sem substituto disponível",
              body: `Estoque ${row.host}:${row.port} falhou ${nextFailures}x e não há reposição disponível na VPS.`,
              link: "/admin/inventory",
              metadata: { stockId: row.id, host: row.host, port: row.port },
              dedupeKey: `health-dead-no-replacement:${row.id}`,
            });
            return;
          }

          await supabaseAdmin.from("proxy_stock").update({ status: "removed" }).eq("id", row.id);
          await supabaseAdmin
            .from("proxy_stock")
            .update({ status: "allocated" })
            .eq("id", replacement.id);

          if (cp) {
            await supabaseAdmin
              .from("customer_proxies")
              .update({ stock_id: replacement.id, allocated_at: new Date().toISOString() })
              .eq("id", cp.id);

            await enqueueNotification({
              userId: cp.user_id,
              kind: "system",
              title: "✅ Proxy corrigido automaticamente",
              body: "Detectamos instabilidade no seu proxy e já trocamos por um funcionando. Nenhuma ação necessária.",
              link: "/dashboard",
              dedupeKey: `auto-swap:${cp.id}:${row.id}`,
            });
          }

          summary.swapped++;
          void notifyAllAdmins({
            title: "🔧 Proxy morto trocado automaticamente",
            body: `${row.host}:${row.port} falhou ${nextFailures}x seguidas e foi trocado por estoque saudável.`,
            link: "/admin/inventory",
            metadata: { stockId: row.id, replacementId: replacement.id },
            dedupeKey: `health-auto-swap:${row.id}`,
          });
        });

        return Response.json({ ok: true, summary });
      },
    },
  },
});
