import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

export type PublicPlan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  country_code: string;
  price_monthly_cents: number;
  price_yearly_cents: number | null;
  block_size: number;
};

export const getPublicCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, slug, name, description, country_code, price_monthly_cents, price_yearly_cents, block_size, active")
    .eq("active", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    country_code: p.country_code,
    price_monthly_cents: p.price_monthly_cents,
    price_yearly_cents: p.price_yearly_cents,
    block_size: p.block_size,
  })) as PublicPlan[];
});
