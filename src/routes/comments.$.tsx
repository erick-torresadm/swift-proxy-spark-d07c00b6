import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Legado WordPress /comments/feed/* — devolve 410 Gone para o Google parar de tentar.
export const Route = createFileRoute("/comments/$")({
  server: {
    handlers: {
      GET: () =>
        new Response("Gone", {
          status: 410,
          headers: { "Content-Type": "text/plain" },
        }),
    },
  },
});
