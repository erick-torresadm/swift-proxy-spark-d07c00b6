/**
 * Cron: walks IPv6 blocks (BR + US) expiring in the next 3 days. Renews
 * blocks with paying customers; abandons empty blocks to save money.
 * Runs daily 09:00 UTC.
 */
import { createFileRoute } from "@tanstack/react-router";
import { checkCronAuth } from "@/lib/cron-auth.server";
import { runRenewalSweep } from "@/lib/allocation.server";

export const Route = createFileRoute("/api/public/hooks/renewal-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;
        const url = new URL(request.url);
        const dryRun = url.searchParams.get("dry_run") === "1";
        const windowDays = Number(url.searchParams.get("window_days")) || 3;
        try {
          const result = await runRenewalSweep({ dryRun, windowDays });
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
