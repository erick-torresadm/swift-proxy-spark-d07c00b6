/**
 * Cron: drena a fila de emails (email_queue) respeitando o limite
 * do plano gratuito do Resend. Rodar a cada minuto.
 */
import { createFileRoute } from "@tanstack/react-router";
import { checkCronAuth } from "@/lib/cron-auth.server";
import { processEmailQueue } from "@/lib/email-queue.server";

export const Route = createFileRoute("/api/public/hooks/email-queue-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;
        try {
          const result = await processEmailQueue();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
