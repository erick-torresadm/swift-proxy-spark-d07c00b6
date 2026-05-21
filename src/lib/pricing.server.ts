/**
 * Pricing dinâmico USD→BRL com markup configurável.
 * - Custo USD vem de `calcOrder` da ProxySeller (ou cache do último restock)
 * - Multiplica por cotação USD→BRL + markup % → preço sugerido em BRL
 */
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { calcOrder, safe, type PsProxyKind } from "./proxyseller.server";
import { getUsdBrl } from "./fx.server";

export type PricingSnapshot = {
  product_id: string;
  product_name: string;
  product_slug: string;
  current_price_cents: number;
  cost_usd: number | null;
  cost_brl_cents: number | null;
  markup_pct: number;
  suggested_price_cents: number | null;
  margin_pct: number | null;
  rate_usd_brl: number;
  below_min_margin: boolean;
  error: string | null;
};

function categoryToKind(category: string | null): PsProxyKind | null {
  if (!category) return null;
  if (category.startsWith("ipv6")) return "ipv6";
  if (category === "ipv4") return "ipv4";
  if (category === "isp") return "isp";
  if (category === "mobile") return "mobile";
  return null;
}

export async function computePricingSnapshots(): Promise<PricingSnapshot[]> {
  const { rate: usdBrl } = await getUsdBrl();

  const { data: products } = await supabaseAdmin
    .from("products")
    .select("id, slug, name, category, price_monthly_cents, block_size, provider_tariff_id")
    .eq("active", true);

  const { data: rules } = await supabaseAdmin.from("pricing_rules").select("*");
  const rulesById = new Map((rules ?? []).map((r) => [r.product_id, r]));

  const out: PricingSnapshot[] = [];
  for (const p of products ?? []) {
    const rule = rulesById.get(p.id);
    const markup_pct = rule?.markup_pct ?? 100; // default: 2x
    const min_margin_pct = rule?.min_margin_pct ?? 30;

    let cost_usd: number | null = null;
    let error: string | null = null;
    const kind = categoryToKind(p.category);

    if (kind && p.provider_tariff_id) {
      try {
        const cfg = JSON.parse(p.provider_tariff_id);
        const result = await safe(() =>
          calcOrder(kind, {
            countryId: cfg.countryId,
            periodId: cfg.periodId,
            quantity: p.block_size ?? 1,
          }),
        );
        if (result.ok) cost_usd = result.data.total ?? null;
        else error = result.error;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }

    const cost_brl_cents = cost_usd != null ? Math.round(cost_usd * usdBrl * 100) : null;
    const suggested_price_cents =
      cost_brl_cents != null ? Math.round(cost_brl_cents * (1 + markup_pct / 100)) : null;
    const margin_pct =
      cost_brl_cents && cost_brl_cents > 0 && p.price_monthly_cents
        ? ((p.price_monthly_cents - cost_brl_cents) / p.price_monthly_cents) * 100
        : null;

    out.push({
      product_id: p.id,
      product_name: p.name,
      product_slug: p.slug,
      current_price_cents: p.price_monthly_cents,
      cost_usd,
      cost_brl_cents,
      markup_pct,
      suggested_price_cents,
      margin_pct,
      rate_usd_brl: usdBrl,
      below_min_margin: margin_pct != null && margin_pct < min_margin_pct,
      error,
    });
  }
  return out;
}
