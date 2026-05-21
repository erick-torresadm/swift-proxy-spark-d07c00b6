import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Retorna a taxa USD->BRL atual (1 USD = X BRL).
 * Cacheia em fx_rates por até 6h e refresca via awesomeapi (sem chave).
 */
export const getUsdBrlRate = createServerFn({ method: "GET" }).handler(async () => {
  const { data: latest } = await supabaseAdmin
    .from("fx_rates")
    .select("rate_brl, fetched_at")
    .eq("currency", "USD")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
  const fresh = latest && new Date(latest.fetched_at).getTime() > sixHoursAgo;
  if (fresh) {
    return { rate: Number(latest.rate_brl), fetched_at: latest.fetched_at };
  }

  // Refresh via awesomeapi (USD-BRL) — sem auth
  try {
    const res = await fetch("https://economia.awesomeapi.com.br/last/USD-BRL", {
      headers: { accept: "application/json" },
    });
    if (res.ok) {
      const j = (await res.json()) as Record<string, { bid: string }>;
      const bid = parseFloat(j.USDBRL?.bid ?? "0");
      if (bid > 0) {
        await supabaseAdmin.from("fx_rates").insert({
          currency: "USD",
          rate_brl: bid,
          source: "awesomeapi",
        });
        return { rate: bid, fetched_at: new Date().toISOString() };
      }
    }
  } catch {}

  // Fallback: usa o último valor cacheado mesmo que velho, ou 5.0 como default seguro
  if (latest) return { rate: Number(latest.rate_brl), fetched_at: latest.fetched_at };
  return { rate: 5.0, fetched_at: new Date().toISOString() };
});
