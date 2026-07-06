import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

export interface BotHistoryMsg {
  sender: "client" | "admin" | "system";
  body: string;
}

export interface BotResult {
  reply: string;
  cta?: { label: string; url: string };
  escalate: boolean;
}

const SYSTEM_PROMPT = `Você é a "Fast", assistente virtual do FastProxy (fastproxy.com.br), empresa brasileira de proxies dedicados.

TOM: humano, direto, gentil, em português brasileiro. Sem emojis excessivos (no máximo 1). Frases curtas. Nunca diga que é IA — diga "sou do time FastProxy". Nunca invente preços exatos ou prazos que não estejam abaixo.

PRODUTOS E LINKS (use como CTA quando fizer sentido):
- IPv6 (mais barato, alto volume, automação): /proxy-ipv6
- IPv4 dedicado (compatibilidade máxima, qualquer plataforma): /proxy-ipv4
- ISP residencial (Instagram, WhatsApp, contas sensíveis): /proxy-isp
- Facebook Ads: /proxy-facebook-ads
- Comprar / ver planos: /checkout
- Área do cliente (proxies, faturas, reposição): /dashboard
- Login: /login  ·  Criar conta: /signup
- Cancelar assinatura: /dashboard/cancelar
- Blog / tutoriais: /blog

FATOS:
- Entrega imediata após pagamento aprovado.
- Formato entregue: HOST:PORTA:USUARIO:SENHA.
- Aceita Pix, cartão recorrente e boleto.
- Sem fidelidade — cancela pelo painel.
- Reposição de proxy com 1 clique no painel.
- Suporte humano: seg-sex 9h-19h.
- Para Instagram/WhatsApp recomende ISP. Para scraping/volume, IPv6. Para geral, IPv4.

REGRAS DE RESPOSTA:
1) Sempre responda a dúvida direto.
2) Se existir uma página ideal, inclua uma CTA levando pra lá.
3) Só escale (escalate=true) se: o cliente pediu falar com humano/atendente, é reclamação séria, problema em pedido específico que exige olhar conta, cobrança indevida, ou você não sabe responder com segurança.
4) NUNCA peça dados sensíveis (senha, cartão). Se precisar do pedido, peça só o e-mail ou ID.
5) Responda SEMPRE em JSON válido no formato:
{"reply":"...","cta":{"label":"Ver planos IPv4","url":"/proxy-ipv4"},"escalate":false}
Se não tiver CTA, omita o campo cta. Nada fora do JSON.`;

export async function generateBotReply(history: BotHistoryMsg[]): Promise<BotResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-12).map((m) => ({
      role: m.sender === "client" ? "user" : "assistant",
      content: m.body,
    })),
  ];

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    console.error("bot AI error", res.status, await res.text().catch(() => ""));
    return {
      reply: "Deixa eu chamar alguém do time humano pra te ajudar. Só um instante.",
      escalate: true,
    };
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(content) as BotResult;
    return {
      reply: String(parsed.reply || "Como posso ajudar?").slice(0, 1500),
      cta:
        parsed.cta && parsed.cta.label && parsed.cta.url
          ? { label: String(parsed.cta.label).slice(0, 40), url: String(parsed.cta.url).slice(0, 200) }
          : undefined,
      escalate: Boolean(parsed.escalate),
    };
  } catch {
    return {
      reply: content.trim() || "Como posso te ajudar?",
      escalate: false,
    };
  }
}

/** Formata mensagem do bot para persistir (inclui marcador de CTA opcional). */
export function formatBotMessage(r: BotResult): string {
  if (r.cta) return `${r.reply}\n[[CTA:${r.cta.label}|${r.cta.url}]]`;
  return r.reply;
}

export async function notifyAdminsOfEscalation(conversationId: string, preview: string) {
  const { notifyAllAdmins } = await import("./notifications.server");
  await notifyAllAdmins({
    title: "💬 Novo chat aguardando atendimento",
    body: preview.slice(0, 140),
    link: "/admin/chat",
    dedupeKey: `chat:esc:${conversationId}`,
  });
  await supabaseAdmin
    .from("chat_conversations")
    .update({ status: "waiting" })
    .eq("id", conversationId);
}
