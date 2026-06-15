import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Legado WordPress /category/* → blog
export const Route = createFileRoute("/category/$")({
  server: {
    handlers: {
      GET: () =>
        new Response(null, {
          status: 301,
          headers: { Location: "https://www.fastproxy.com.br/blog" },
        }),
    },
  },
});
