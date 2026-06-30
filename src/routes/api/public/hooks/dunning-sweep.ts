/**
 * Cron: envia campanhas de cobrança (inadimplentes) e recuperação
 * (cancelados). Roda 1x/dia. Idempotente — não reenvia o mesmo estágio.
 */
import { createFileRoute } from "@tanstack/react-router";
import { checkCronAuth } from "@/lib/cron-auth.server";
import { runDunningSweep } from "@/lib/dunning.server";

export const Route = createFileRoute("/api/public/hooks/dunning-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;
        const url = new URL(request.url);
        const dryRun = url.searchParams.get("dry_run") === "1";
        try {
          const result = await runDunningSweep({ dryRun });
          return Response.json({ ok: true, dryRun, ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
