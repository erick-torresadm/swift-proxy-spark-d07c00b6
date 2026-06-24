/**
 * Cron: pulls every IP from the ProxySeller account into local stock and
 * reconciles `expires_at`. Runs hourly. Safe to invoke manually from
 * /admin/inventory → "Sincronizar com ProxySeller".
 */
import { createFileRoute } from "@tanstack/react-router";
import { checkCronAuth } from "@/lib/cron-auth.server";
import { runFullProviderSync } from "@/lib/allocation.server";

export const Route = createFileRoute("/api/public/hooks/proxyseller-full-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;
        try {
          const result = await runFullProviderSync();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
