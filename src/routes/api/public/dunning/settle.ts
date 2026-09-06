/**
 * Destino do success_url do checkout de regularização (dunning).
 * Confirma no Stripe que a sessão foi paga, quita a fatura em atraso
 * (paid_out_of_band) e manda o cliente pro painel. O cron stripe-sync
 * vê a assinatura ativa de novo e reativa os proxies em até 5 min.
 */
import { createFileRoute } from "@tanstack/react-router";
import { settleDunningSession } from "@/lib/dunning.server";

export const Route = createFileRoute("/api/public/dunning/settle")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("session_id");
        const back = new URL("/dashboard/proxies", url.origin);
        if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
          return Response.redirect(back.toString(), 302);
        }
        try {
          const r = await settleDunningSession(sessionId);
          back.searchParams.set("settled", r.ok ? "1" : "0");
        } catch {
          back.searchParams.set("settled", "0");
        }
        return Response.redirect(back.toString(), 302);
      },
    },
  },
});
