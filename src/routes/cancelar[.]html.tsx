import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Página /cancelar não existe mais — manda para a área de cancelamento do dashboard.
export const Route = createFileRoute("/cancelar.html")({
  server: {
    handlers: {
      GET: () =>
        new Response(null, {
          status: 301,
          headers: { Location: "https://www.fastproxy.com.br/dashboard/cancelar" },
        }),
    },
  },
});
