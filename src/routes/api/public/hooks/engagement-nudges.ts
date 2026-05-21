import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { enqueueNotification } from "@/lib/notifications.server";

/**
 * Mensagens automáticas de engajamento.
 * Chamado por pg_cron com body { kind: "reminder" | "promo" | "motivational" }.
 *
 * - reminder    (a cada 3 dias): lembra o usuário de checar o painel / status dos proxies
 * - promo       (a cada 7 dias): oferece desconto pra renovar ou comprar mais
 * - motivational (a cada 4 dias): mensagem motivacional curta
 *
 * Só envia pra usuários com pelo menos 1 pedido (ativos ou expirados),
 * pra não spammar quem só criou conta.
 */
export const Route = createFileRoute("/api/public/hooks/engagement-nudges")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          kind?: "reminder" | "promo" | "motivational";
        };
        const kind = body.kind ?? "reminder";
        return Response.json(await run(kind));
      },
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const kind =
          (url.searchParams.get("kind") as "reminder" | "promo" | "motivational") ??
          "reminder";
        return Response.json(await run(kind));
      },
    },
  },
});

type Kind = "reminder" | "promo" | "motivational";

const REMINDERS = [
  {
    title: "Tudo certo com seus proxies?",
    body: "Dá uma olhada rápida no painel pra conferir status e validade.",
  },
  {
    title: "Lembrete: rotação de IP disponível",
    body: "Você pode rotacionar seus IPs sempre que precisar direto no painel.",
  },
  {
    title: "Cheque seus avisos",
    body: "Veja se tem alguma notificação importante esperando você.",
  },
  {
    title: "Suporte rápido por chat",
    body: "Qualquer dúvida, manda mensagem pelo chat — respondemos rápido.",
  },
];

const PROMOS = [
  {
    title: "10% OFF pra renovar agora",
    body: "Use o cupom FIDELIDADE10 no checkout. Válido por 48h.",
    code: "FIDELIDADE10",
  },
  {
    title: "Que tal mais um proxy?",
    body: "10% OFF no próximo pedido com o cupom MAIS10. Aproveita.",
    code: "MAIS10",
  },
  {
    title: "Recompensa de cliente",
    body: "Desconto especial esperando você. Cupom: VOLTA10 — 10% OFF.",
    code: "VOLTA10",
  },
];

const MOTIVATIONAL = [
  {
    title: "Foco no que importa",
    body: "Um dia produtivo começa com as ferramentas certas. Bom trabalho!",
  },
  {
    title: "Continue firme",
    body: "Cada projeto entregue é um passo a mais. A gente tá junto.",
  },
  {
    title: "Você tá indo bem",
    body: "Constância vence talento. Bora pra mais um dia.",
  },
  {
    title: "Pequenos passos, grandes resultados",
    body: "O que você faz hoje aparece no resultado de amanhã.",
  },
];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

async function run(kind: Kind) {
  // Pega usuários únicos que já compraram alguma vez
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("user_id")
    .not("user_id", "is", null)
    .in("status", ["paid", "past_due", "grace", "expired", "cancelled"]);

  const userIds = Array.from(
    new Set((orders ?? []).map((o) => o.user_id).filter(Boolean) as string[]),
  );

  if (userIds.length === 0) {
    return { ok: true, kind, sent: 0, skipped: 0, reason: "no_users" };
  }

  const today = new Date().toISOString().slice(0, 10);
  let sent = 0;
  let skipped = 0;

  for (const userId of userIds) {
    let payload: { title: string; body: string; link: string };
    let dedupe: string;

    if (kind === "reminder") {
      const p = pick(REMINDERS);
      payload = { ...p, link: "/dashboard" };
      dedupe = `nudge-reminder-${userId}-${today}`;
    } else if (kind === "promo") {
      const p = pick(PROMOS);
      payload = {
        title: p.title,
        body: p.body,
        link: "/dashboard/orders",
      };
      dedupe = `nudge-promo-${userId}-${today}`;
    } else {
      const p = pick(MOTIVATIONAL);
      payload = { ...p, link: "/dashboard" };
      dedupe = `nudge-motiv-${userId}-${today}`;
    }

    const res = await enqueueNotification({
      userId,
      kind: kind === "promo" ? "promo" : "system",
      title: payload.title,
      body: payload.body,
      link: payload.link,
      dedupeKey: dedupe,
    });

    if (res) sent++;
    else skipped++;
  }

  return { ok: true, kind, users: userIds.length, sent, skipped };
}
