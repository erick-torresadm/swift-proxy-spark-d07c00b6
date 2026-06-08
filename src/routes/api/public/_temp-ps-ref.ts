import { createFileRoute } from "@tanstack/react-router";
import { getReferenceList } from "@/lib/proxyseller.server";

// TEMP — used once to discover ProxySeller country/period IDs. Delete after use.
export const Route = createFileRoute("/api/public/_temp-ps-ref")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const kind = (url.searchParams.get("kind") ?? "ipv4") as "ipv4" | "ipv6" | "isp" | "mobile";
        const data = await getReferenceList(kind);
        return Response.json({ kind, data });
      },
    },
  },
});
