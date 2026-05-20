/**
 * Conversão de moeda. Busca cotação USD→BRL da AwesomeAPI (pública, sem chave)
 * e cacheia em `fx_rates`. Fallback: última cotação salva.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FRESH_MS = 30 * 60 * 1000; // 30 min

export async function getUsdBrl(): Promise<{ rate: number; fetched_at: string; source: string }> {
  // 1) tenta cache fresco
  const { data: cached } = await supabaseAdmin
    .from("fx_rates")
    .select("rate_brl, fetched_at, source")
    .eq("currency", "USD")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < FRESH_MS) {
    return { rate: Number(cached.rate_brl), fetched_at: cached.fetched_at, source: cached.source ?? "cache" };
  }

  // 2) fetch
  try {
    const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL");
    const json = (await res.json()) as { USDBRL?: { bid?: string } };
    const bid = Number(json?.USDBRL?.bid);
    if (!isFinite(bid) || bid <= 0) throw new Error("invalid bid");

    const now = new Date().toISOString();
    await supabaseAdmin.from("fx_rates").insert({
      currency: "USD",
      rate_brl: bid,
      source: "awesomeapi",
      fetched_at: now,
    });
    return { rate: bid, fetched_at: now, source: "awesomeapi" };
  } catch (e) {
    if (cached) {
      return { rate: Number(cached.rate_brl), fetched_at: cached.fetched_at, source: "stale-cache" };
    }
    throw new Error(`FX unavailable: ${e instanceof Error ? e.message : String(e)}`);
  }
}
