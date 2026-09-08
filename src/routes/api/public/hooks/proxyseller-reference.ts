/**
 * Endpoint temporário de pesquisa: lista as tarifas reais da ProxySeller
 * pra Brasil (mobile/isp) — usado só pra decidir se dá pra vender proxy
 * de operadora móvel de verdade. Remover depois de usar.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getReferenceList, type PsProxyKind } from "@/lib/proxyseller.server";
import { checkCronAuth } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/proxyseller-reference")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;
        const url = new URL(request.url);
        const kind = (url.searchParams.get("kind") ?? "mobile") as PsProxyKind;
        try {
          const data = await getReferenceList(kind);
          return Response.json({ ok: true, kind, data });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
