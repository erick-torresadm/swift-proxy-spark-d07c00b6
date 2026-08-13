/**
 * Recuperação de pedidos "órfãos".
 *
 * Dois furos históricos que faziam um cliente pagante NÃO ver o plano no painel:
 *
 *  1. Pedido existe no banco com `user_id = null` (checkout como convidado) e o
 *     cliente cria a conta depois → nada liga o pedido ao usuário.
 *  2. Assinatura existe no Stripe mas NÃO existe pedido no banco (checkouts
 *     legados / criados fora do fluxo atual) → o painel não tem o que mostrar.
 *
 * Aqui resolvemos os dois: `claimOrdersForUser` (barato, só banco) e
 * `importStripeSubscriptionsForEmail` / `backfillOrphanStripeSubscriptions`
 * (consulta o Stripe e cria o pedido faltante, já alocando os proxies).
 */
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { getStripe } from "./stripe.server";
import { allocateProxiesForOrder } from "./allocation.server";

/** Procura o user_id pelo e-mail paginando o Auth (listUsers não filtra por email). */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/**
 * Liga ao usuário todos os pedidos (e proxies) que estão soltos com o mesmo e-mail.
 * Idempotente e barato — pode rodar em todo carregamento do dashboard.
 */
export async function claimOrdersForUser(
  userId: string,
  email: string | null | undefined,
): Promise<{ orders_claimed: number; proxies_claimed: number }> {
  if (!email) return { orders_claimed: 0, proxies_claimed: 0 };
  const normalized = email.trim().toLowerCase();

  const { data: orphan } = await supabaseAdmin
    .from("orders")
    .select("id, customer_email")
    .is("user_id", null);

  const ids = (orphan ?? [])
    .filter((o) => (o.customer_email ?? "").trim().toLowerCase() === normalized)
    .map((o) => o.id as string);

  if (ids.length === 0) return { orders_claimed: 0, proxies_claimed: 0 };

  await supabaseAdmin.from("orders").update({ user_id: userId }).in("id", ids);

  const { data: proxies } = await supabaseAdmin
    .from("customer_proxies")
    .select("id")
    .in("order_id", ids)
    .neq("user_id", userId);
  const proxyIds = (proxies ?? []).map((p) => p.id as string);
  if (proxyIds.length > 0) {
    await supabaseAdmin.from("customer_proxies").update({ user_id: userId }).in("id", proxyIds);
  }

  return { orders_claimed: ids.length, proxies_claimed: proxyIds.length };
}

type ProductRow = {
  id: string;
  slug: string;
  category: string;
  country_code: string | null;
  price_monthly_cents: number;
};

/** Heurística de mapeamento: descrição do Stripe → produto do catálogo. */
export async function guessProductFromStripe(label: string): Promise<ProductRow | null> {
  const { data: products } = await supabaseAdmin
    .from("products")
    .select("id, slug, category, country_code, price_monthly_cents")
    .eq("active", true);
  const list = (products ?? []) as ProductRow[];
  if (list.length === 0) return null;

  const t = label.toLowerCase();
  const isUS = /(eua|usa|\bus\b|united states|american)/.test(t);
  const country = isUS ? "US" : "BR";

  let slug: string;
  if (/rotativ/.test(t)) slug = "ipv6-rot-br";
  else if (/(facebook|\bfb\b|meta ads)/.test(t)) slug = isUS ? "ipv6-fb-us" : "ipv6-fb-br";
  else if (/isp|residencial/.test(t)) slug = isUS ? "isp-us" : "isp-br";
  else if (/ipv4/.test(t)) slug = isUS ? "ipv4-us" : "ipv4-br";
  else slug = isUS ? "ipv6-us" : "ipv6-br";

  return (
    list.find((p) => p.slug === slug) ??
    list.find((p) => p.category === "ipv6" && p.country_code === country) ??
    list[0]
  );
}

type ImportResult = { imported: number; allocated: number; errors: string[] };

async function importSubscription(
  sub: {
    id: string;
    status: string;
    customer: string | { id?: string } | null;
    items: { data: Array<{ quantity?: number | null; price: unknown }> };
  },
  email: string | null,
  userId: string | null,
  name: string | null,
  phone: string | null,
): Promise<{ imported: boolean; allocated: number; error?: string }> {
  const { data: existing } = await supabaseAdmin
    .from("orders")
    .select("id, user_id")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();

  if (existing) {
    // já existe: garante o vínculo com o usuário e a alocação
    if (!existing.user_id && userId) {
      await supabaseAdmin.from("orders").update({ user_id: userId }).eq("id", existing.id);
      await supabaseAdmin
        .from("customer_proxies")
        .update({ user_id: userId })
        .eq("order_id", existing.id);
    }
    const r = await allocateProxiesForOrder(existing.id as string);
    return { imported: false, allocated: r.allocated };
  }

  const item = sub.items.data[0];
  const price = item?.price as
    | {
        id?: string;
        unit_amount?: number | null;
        nickname?: string | null;
        recurring?: { interval?: string } | null;
        product?: string | { id?: string; name?: string } | null;
      }
    | undefined;

  let label = price?.nickname ?? "";
  const prodRef = price?.product;
  if (typeof prodRef === "object" && prodRef?.name) label = `${label} ${prodRef.name}`;
  else if (typeof prodRef === "string") {
    try {
      const p = await getStripe().products.retrieve(prodRef);
      label = `${label} ${p.name ?? ""}`;
    } catch {
      /* ignore */
    }
  }

  const product = await guessProductFromStripe(label);
  if (!product) return { imported: false, allocated: 0, error: `${sub.id}: sem produto no catálogo` };

  const quantity = item?.quantity ?? 1;
  const interval = price?.recurring?.interval;
  const intervalCount = (price?.recurring as { interval_count?: number } | undefined)?.interval_count ?? 1;
  const billing_cycle =
    interval === "year"
      ? "yearly"
      : interval === "month" && intervalCount === 3
        ? "quarterly"
        : interval === "month" && intervalCount === 6
          ? "semiannual"
          : "monthly";
  const amount = (price?.unit_amount ?? product.price_monthly_cents) * quantity;
  const customerId = typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null);
  const active = ["active", "trialing"].includes(sub.status);

  const { data: inserted, error } = await supabaseAdmin
    .from("orders")
    .insert({
      user_id: userId,
      product_id: product.id,
      quantity,
      billing_cycle,
      amount_cents: amount,
      status: active ? "paid" : "past_due",
      stripe_subscription_id: sub.id,
      stripe_customer_id: customerId,
      customer_email: email,
      customer_name: name,
      customer_phone: phone,
    } as never)
    .select("id")
    .maybeSingle();

  if (error || !inserted) {
    return { imported: false, allocated: 0, error: `${sub.id}: ${error?.message ?? "insert falhou"}` };
  }

  const r = active ? await allocateProxiesForOrder(inserted.id as string) : { allocated: 0 };
  return { imported: true, allocated: r.allocated };
}

/**
 * Importa para o banco as assinaturas do Stripe desse e-mail que ainda não têm pedido.
 * Chamado quando o cliente abre o painel e não vemos nada dele.
 */
export async function importStripeSubscriptionsForEmail(
  email: string,
  userId: string | null,
): Promise<ImportResult> {
  const out: ImportResult = { imported: 0, allocated: 0, errors: [] };
  const stripe = getStripe();

  let customers;
  try {
    customers = await stripe.customers.list({ email: email.trim().toLowerCase(), limit: 10 });
  } catch (e) {
    out.errors.push(e instanceof Error ? e.message : String(e));
    return out;
  }

  for (const c of customers.data) {
    let subs;
    try {
      subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 50 });
    } catch (e) {
      out.errors.push(`${c.id}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const sub of subs.data) {
      if (!["active", "trialing", "past_due", "unpaid"].includes(sub.status)) continue;
      try {
        const r = await importSubscription(
          sub as never,
          c.email ?? email,
          userId,
          c.name ?? null,
          c.phone ?? null,
        );
        if (r.imported) out.imported++;
        out.allocated += r.allocated;
        if (r.error) out.errors.push(r.error);
      } catch (e) {
        out.errors.push(`${sub.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return out;
}

/**
 * Varredura global (cron): qualquer assinatura ativa no Stripe sem pedido no banco
 * vira pedido pago + alocação. Garante que ninguém fique "pagando e sem painel".
 */
export async function backfillOrphanStripeSubscriptions(
  limit = 100,
): Promise<ImportResult & { scanned: number }> {
  const out = { scanned: 0, imported: 0, allocated: 0, errors: [] as string[] };
  const stripe = getStripe();

  const statuses: Array<"active" | "past_due"> = ["active", "past_due"];
  for (const status of statuses) {
    let startingAfter: string | undefined;
    for (let page = 0; page < 10; page++) {
      const subs = await stripe.subscriptions.list({
        status,
        limit: 100,
        starting_after: startingAfter,
      });
      for (const sub of subs.data) {
        out.scanned++;
        if (out.imported >= limit) break;
        const { data: existing } = await supabaseAdmin
          .from("orders")
          .select("id")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle();
        if (existing) continue;

        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        let email: string | null = null;
        let name: string | null = null;
        let phone: string | null = null;
        if (customerId) {
          try {
            const c = await stripe.customers.retrieve(customerId);
            if (!("deleted" in c && c.deleted)) {
              email = (c as { email?: string | null }).email ?? null;
              name = (c as { name?: string | null }).name ?? null;
              phone = (c as { phone?: string | null }).phone ?? null;
            }
          } catch {
            /* ignore */
          }
        }
        const userId = email ? await findUserIdByEmail(email) : null;
        try {
          const r = await importSubscription(sub as never, email, userId, name, phone);
          if (r.imported) out.imported++;
          out.allocated += r.allocated;
          if (r.error) out.errors.push(r.error);
        } catch (e) {
          out.errors.push(`${sub.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (!subs.has_more || out.imported >= limit) break;
      startingAfter = subs.data[subs.data.length - 1]?.id;
    }
  }

  return out;
}
