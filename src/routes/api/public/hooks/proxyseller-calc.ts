/**
 * Endpoint temporário de pesquisa: calcula preço real (custo) na ProxySeller
 * sem comprar nada. Remover depois de usar.
 */
import { createFileRoute } from "@tanstack/react-router";
import { calcOrder, type PsProxyKind } from "@/lib/proxyseller.server";
import { checkCronAuth } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/proxyseller-calc")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;
        const url = new URL(request.url);
        const kind = (url.searchParams.get("kind") ?? "mobile") as PsProxyKind;
        const params: Record<string, unknown> = {};
        for (const [k, v] of url.searchParams.entries()) {
          if (k === "kind") continue;
          const n = Number(v);
          params[k] = Number.isFinite(n) && v.trim() !== "" ? n : v;
        }
        try {
          const data = await calcOrder(kind, params);
          return Response.json({ ok: true, kind, params, data });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
