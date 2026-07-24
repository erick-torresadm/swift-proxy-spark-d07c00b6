/**
 * Cron: varre pedidos pagos sem proxies alocados e re-tenta.
 * Alerta admin quando pedido pago está sem IP há > 10 min.
 * Roda a cada 5 min.
 */
import { createFileRoute } from "@tanstack/react-router";
import { checkCronAuth } from "@/lib/cron-auth.server";
import { runFulfillmentSweep, checkManualStockLow } from "@/lib/allocation.server";

export const Route = createFileRoute("/api/public/hooks/fulfillment-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;
        const url = new URL(request.url);
        const alertAfterMinutes = Number(url.searchParams.get("alert_after_minutes")) || 10;
        try {
          const result = await runFulfillmentSweep({ alertAfterMinutes });
          const stockCheck = await checkManualStockLow().catch(() => ({ checked: 0, alerted: 0 }));
          return Response.json({ ok: true, ...result, manual_stock: stockCheck });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});

