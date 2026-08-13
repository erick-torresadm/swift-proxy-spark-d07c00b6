import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/supabase-custom/auth-middleware";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { getStripe } from "./stripe.server";
import { allocateProxiesForOrder, hideOrReleaseProxiesForOrder } from "./allocation.server";
import { reconcileOrderWithStripe } from "./reconcile.server";
import { claimOrdersForUser, importStripeSubscriptionsForEmail } from "./order-claim.server";


/**
 * Endpoint público que força a sincronização de um pedido com o Stripe.
 * Idempotente. Usado pela página /checkout/success quando o webhook atrasa.
 */
export const reconcileOrderPublic = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ orderId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const r = await reconcileOrderWithStripe(data.orderId);
    return {
      status: r.status,
      allocated: r.allocated,
      short: r.short,
      changed: r.changed,
    };
  });



/**
 * Public lookup by order ID — used by the /checkout/success page to poll
 * until the webhook marks the order as paid and allocates proxies.
 * Returns only non-sensitive fields.
 */
export const getOrderPublicStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ orderId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, status, quantity, billing_cycle, amount_cents, user_id, current_period_end, created_at, bumps, vip_support, upsell_taken, upsell_offered_at, products(name, slug, block_size)",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return null;

    const { count: allocated } = await supabaseAdmin
      .from("customer_proxies")
      .select("*", { count: "exact", head: true })
      .eq("order_id", order.id)
      .eq("status", "active");

    return {
      id: order.id,
      status: order.status,
      quantity: order.quantity,
      billing_cycle: order.billing_cycle,
      amount_cents: order.amount_cents,
      product_name: order.products?.name ?? "Plano",
      product_slug: order.products?.slug ?? null,
      block_size: order.products?.block_size ?? 1,
      allocated_count: allocated ?? 0,
      has_user: !!order.user_id,
      current_period_end: order.current_period_end,
      created_at: order.created_at,
      bumps: (order as { bumps?: unknown }).bumps ?? {},
      vip_support: (order as { vip_support?: boolean }).vip_support ?? false,
      upsell_taken: (order as { upsell_taken?: boolean }).upsell_taken ?? false,
      upsell_offered_at: (order as { upsell_offered_at?: string | null }).upsell_offered_at ?? null,
    };
  });


export const getMyOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const email = (context.claims as { email?: string } | undefined)?.email ?? null;
    const since = new Date(Date.now() - 30 * 86400000).toISOString();

    // 1) Cola pedidos feitos como convidado (mesmo e-mail) na conta do usuário.
    try {
      await claimOrdersForUser(userId, email);
    } catch (e) {
      console.error("claimOrdersForUser failed", e);
    }

    // 2) Se ainda assim não há nenhum pedido, procura assinatura ativa no Stripe
    //    e importa (casos legados sem registro no banco).
    if (email) {
      const { count: known } = await supabaseAdmin
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);
      if ((known ?? 0) === 0) {
        try {
          await importStripeSubscriptionsForEmail(email, userId);
        } catch (e) {
          console.error("importStripeSubscriptionsForEmail failed", e);
        }
      }
    }

    const [{ count: activeProxies }, { data: orders }, { data: paidOrders30 }] =
      await Promise.all([

        supabaseAdmin
          .from("customer_proxies")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "active"),
        supabaseAdmin
          .from("orders")
          .select("id, status, current_period_end, amount_cents")
          .eq("user_id", userId),
        supabaseAdmin
          .from("orders")
          .select("amount_cents, created_at")
          .eq("user_id", userId)
          .gte("created_at", since)
          .in("status", ["paid", "past_due", "grace"]),
      ]);

    const spent30d = (paidOrders30 ?? []).reduce(
      (s, o) => s + (o.amount_cents ?? 0),
      0,
    );

    // next renewal date
    const upcoming = (orders ?? [])
      .filter(
        (o) =>
          o.current_period_end &&
          ["paid", "past_due", "grace"].includes(o.status as string),
      )
      .map((o) => new Date(o.current_period_end as string))
      .sort((a, b) => a.getTime() - b.getTime())[0];

    return {
      active_proxies: activeProxies ?? 0,
      orders_count: orders?.length ?? 0,
      spent_30d_cents: spent30d,
      next_renewal: upcoming ? upcoming.toISOString() : null,
    };
  });

export const listMyProxies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("customer_proxies")
      .select(
        "id, stock_id, status, allocated_at, order_id, ip_rotations_used, rotations_reset_at, proxy_stock(host, port, username, password, protocol, country_code), orders(grace_until, products(name, slug, ip_rotations_per_month))",
      )
      .eq("user_id", context.userId)
      .eq("status", "active")
      .order("allocated_at", { ascending: false });

    return (data ?? []).map((r) => ({
      id: r.id,
      stock_id: r.stock_id,
      order_id: r.order_id,

      status: r.status as string,
      allocated_at: r.allocated_at,
      host: r.proxy_stock?.host ?? null,
      port: r.proxy_stock?.port ?? null,
      username: r.proxy_stock?.username ?? null,
      password: r.proxy_stock?.password ?? null,
      protocol: r.proxy_stock?.protocol ?? "http",
      country_code: r.proxy_stock?.country_code ?? null,
      product_name: r.orders?.products?.name ?? "Plano",
      product_slug: r.orders?.products?.slug ?? null,
      ip_rotations_used: r.ip_rotations_used ?? 0,
      ip_rotations_per_month: r.orders?.products?.ip_rotations_per_month ?? 0,
      rotations_reset_at: r.rotations_reset_at,
      grace_until: r.orders?.grace_until ?? null,
    }));
  });

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("orders")
      .select(
        "id, status, quantity, billing_cycle, amount_cents, current_period_end, grace_until, created_at, products(name, slug, block_size)",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    return (data ?? []).map((o) => ({
      id: o.id,
      status: o.status as string,
      quantity: o.quantity,
      billing_cycle: o.billing_cycle as string,
      amount_cents: o.amount_cents,
      current_period_end: o.current_period_end,
      grace_until: o.grace_until,
      created_at: o.created_at,
      product_name: o.products?.name ?? "Plano",
      block_size: o.products?.block_size ?? 1,
    }));
  });

/**
 * Rotates the IP for a customer proxy (IPv6 FB plan).
 * Counter resets monthly (30 days from rotations_reset_at).
 * Real provider call is stubbed — wire up to IPv6 provider API later.
 */
export const rotateProxyIp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ proxyId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await supabaseAdmin
      .from("customer_proxies")
      .select(
        "id, user_id, status, stock_id, ip_rotations_used, rotations_reset_at, orders(products(ip_rotations_per_month))",
      )
      .eq("id", data.proxyId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row || row.user_id !== context.userId) {
      throw new Error("Proxy não encontrado");
    }
    if (row.status !== "active") {
      throw new Error("Proxy não está ativo");
    }

    const cap = row.orders?.products?.ip_rotations_per_month ?? 0;
    if (cap <= 0) {
      throw new Error("Este plano não inclui rotação de IP");
    }

    const resetAt = row.rotations_reset_at
      ? new Date(row.rotations_reset_at).getTime()
      : 0;
    const monthMs = 30 * 86400 * 1000;
    const shouldReset = Date.now() - resetAt > monthMs;
    const usedNow = shouldReset ? 0 : (row.ip_rotations_used ?? 0);

    if (usedNow >= cap) {
      throw new Error(
        `Limite mensal atingido (${cap} rotações). Aguarde o reset.`,
      );
    }

    // Rotação: 1º tenta SWAP de estoque local (mesmo produto).
    // Se não houver, chama /proxy/replace no ProxySeller para trocar o IP
    // externamente (recurso incluído no plano Facebook Ads).
    const { data: currentStock } = await supabaseAdmin
      .from("proxy_stock")
      .select("id, product_id, external_proxy_id, provider_order_id, products(category, country_code)")
      .eq("id", row.stock_id as string)
      .maybeSingle();

    if (!currentStock) {
      throw new Error("Estoque atual não encontrado");
    }

    // Para IPv6 FB Ads, permitimos swap dentro do mesmo país entre pools
    // 'ipv6_fb' e 'ipv6' (temos estoque farto de IPv6 BR/US).
    const curCategory = (currentStock as { products?: { category?: string; country_code?: string } }).products?.category ?? "";
    const curCountry = (currentStock as { products?: { category?: string; country_code?: string } }).products?.country_code ?? "BR";
    const siblingCategories = curCategory === "ipv6_fb" || curCategory === "ipv6"
      ? ["ipv6_fb", "ipv6"]
      : [curCategory];

    const { data: siblingProducts } = await supabaseAdmin
      .from("products")
      .select("id")
      .in("category", siblingCategories as never)
      .eq("country_code", curCountry);
    const siblingIds = (siblingProducts ?? []).map((p) => p.id);

    const { data: available, error: availErr } = await supabaseAdmin
      .from("proxy_stock")
      .select("id")
      .in("product_id", siblingIds.length ? siblingIds : [currentStock.product_id])
      .eq("status", "available")
      .neq("id", currentStock.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (availErr) throw new Error(availErr.message);


    if (available) {
      // Caminho rápido: troca por outro IP em estoque
      const { error: newStockErr } = await supabaseAdmin
        .from("proxy_stock")
        .update({ status: "allocated" })
        .eq("id", available.id)
        .eq("status", "available");
      if (newStockErr) throw new Error(newStockErr.message);

      await supabaseAdmin
        .from("proxy_stock")
        .update({ status: "available" })
        .eq("id", currentStock.id);

      const { error: updErr } = await supabaseAdmin
        .from("customer_proxies")
        .update({
          stock_id: available.id,
          ip_rotations_used: usedNow + 1,
          rotations_reset_at: shouldReset
            ? new Date().toISOString()
            : row.rotations_reset_at,
        })
        .eq("id", row.id);
      if (updErr) throw new Error(updErr.message);
    } else {
      // Fallback: pede /proxy/replace ao ProxySeller (rotação real do bloco).
      const ext = (currentStock as { external_proxy_id?: string | null }).external_proxy_id;
      if (!ext) {
        throw new Error(
          "Sem IP substituto em estoque no momento. Nossa equipe foi avisada para preparar um novo IP em minutos — tente de novo em breve.",
        );
      }
      const { replaceProxyIp, psDateToIso } = await import("@/lib/proxyseller.server");
      let newItem;
      try {
        newItem = await replaceProxyIp(ext);
      } catch (e) {
        throw new Error(
          "Não conseguimos trocar o IP com o provedor agora. Tente novamente em alguns minutos — a rotação não foi contabilizada.",
        );
      }
      if (!newItem) {
        throw new Error(
          "O provedor não retornou um novo IP. Tente de novo em alguns minutos — a rotação não foi contabilizada.",
        );
      }

      // Atualiza o próprio estoque com o novo IP mantendo o mesmo stock_id
      const { error: stockErr } = await supabaseAdmin
        .from("proxy_stock")
        .update({
          host: newItem.ip_only,
          port: newItem.port_http ?? newItem.port_socks,
          username: newItem.login,
          password: newItem.password,
          protocol: (newItem.protocol || "http").toLowerCase(),
          external_proxy_id: newItem.id,
          expires_at: psDateToIso(newItem.date_end),
        } as never)
        .eq("id", currentStock.id);
      if (stockErr) throw new Error(stockErr.message);

      const { error: updErr } = await supabaseAdmin
        .from("customer_proxies")
        .update({
          ip_rotations_used: usedNow + 1,
          rotations_reset_at: shouldReset
            ? new Date().toISOString()
            : row.rotations_reset_at,
        })
        .eq("id", row.id);
      if (updErr) throw new Error(updErr.message);
    }


    return {
      ok: true,
      used: usedNow + 1,
      cap,
      remaining: cap - (usedNow + 1),
    };
  });

/**
 * Creates a Stripe Checkout session to reactivate a past_due/grace order
 * with a 20% discount coupon. Returns the URL for redirect.
 */
export const createReactivateCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ orderId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const stripe = getStripe();



    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, user_id, status, billing_cycle, quantity, customer_email, products(name, stripe_price_monthly_id, stripe_price_quarterly_id, stripe_price_semiannual_id, stripe_price_yearly_id)",
      )
      .eq("id", data.orderId)
      .maybeSingle();

    if (!order || order.user_id !== context.userId) {
      throw new Error("Pedido não encontrado");
    }
    if (!["past_due", "grace", "pending"].includes(order.status as string)) {
      throw new Error("Pedido não precisa de reativação");
    }

    const cycle = (order.billing_cycle ?? "monthly") as
      | "monthly"
      | "quarterly"
      | "semiannual"
      | "yearly";
    const priceByCycle = {
      monthly: order.products?.stripe_price_monthly_id,
      quarterly: order.products?.stripe_price_quarterly_id,
      semiannual: order.products?.stripe_price_semiannual_id,
      yearly: order.products?.stripe_price_yearly_id,
    } as const;
    const priceId = priceByCycle[cycle] ?? priceByCycle.monthly;

    if (!priceId) throw new Error("Preço Stripe não configurado");

    // create-or-reuse a 20% off coupon
    const couponId = "reactivate-20";
    try {
      await stripe.coupons.retrieve(couponId);
    } catch {
      await stripe.coupons.create({
        id: couponId,
        percent_off: 20,
        duration: "once",
        name: "Reativação 20% OFF",
      });
    }

    const origin =
      process.env.PUBLIC_SITE_URL ?? "https://www.fastproxy.com.br";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: order.customer_email ?? undefined,
      line_items: [{ price: priceId, quantity: order.quantity }],
      discounts: [{ coupon: couponId }],
      success_url: `${origin}/checkout/success?order=${order.id}`,
      cancel_url: `${origin}/dashboard`,
      metadata: { reactivate_order_id: order.id },
    });

    return { url: session.url };
  });


/**
 * Re-runs proxy allocation for the current user's paid orders that don't
 * yet have proxies attached. Used when the stock auto-purchase failed
 * during the Stripe webhook (e.g. ProxySeller temporarily unavailable).
 */
export const syncMyAllocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "paid");

    const ids = (orders ?? []).map((o) => o.id);
    if (ids.length === 0) {
      return { synced: 0, allocated: 0, short: 0, pending: false, error: null as string | null };
    }

    let allocated = 0;
    let short = 0;
    let pending = false;
    let hadError = false;
    let synced = 0;

    for (const orderId of ids) {
      try {
        const r = await allocateProxiesForOrder(orderId);
        allocated += r.allocated;
        short += r.short;
        if (r.pending) pending = true;
        if (r.error) {
          hadError = true;
          console.error(`[syncMyAllocations] order ${orderId} error:`, r.error);
        }
        synced += 1;
      } catch (e) {
        hadError = true;
        console.error(`[syncMyAllocations] order ${orderId} threw:`, e);
      }
    }

    // Nunca devolvemos detalhe técnico ao cliente — apenas um flag genérico.
    return {
      synced,
      allocated,
      short,
      pending,
      error: hadError && !pending ? "unavailable" : null,
    };
  });

/**
 * Lista pedidos do cliente que ainda podem ser cancelados (ativos / em atraso / carência).
 * Inclui contagem de proxies ativos e flag se já está agendado pra cancelar no Stripe.
 */
export const listMyCancellableOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select(
        "id, status, quantity, billing_cycle, amount_cents, current_period_end, stripe_subscription_id, created_at, products(name, slug, block_size)",
      )
      .eq("user_id", context.userId)
      .in("status", ["paid", "past_due", "grace"])
      .order("created_at", { ascending: false });

    const out: Array<{
      id: string;
      status: string;
      quantity: number;
      billing_cycle: string;
      amount_cents: number;
      current_period_end: string | null;
      product_name: string;
      block_size: number;
      active_proxies: number;
      has_stripe_sub: boolean;
      cancel_at_period_end: boolean;
    }> = [];

    const stripe = getStripe();

    for (const o of orders ?? []) {
      const { count } = await supabaseAdmin
        .from("customer_proxies")
        .select("*", { count: "exact", head: true })
        .eq("order_id", o.id)
        .eq("status", "active");

      let cancelAtPeriodEnd = false;
      if (stripe && o.stripe_subscription_id) {
        try {
          const sub = await stripe.subscriptions.retrieve(o.stripe_subscription_id);
          cancelAtPeriodEnd = !!sub.cancel_at_period_end || sub.status === "canceled";
        } catch {
          // ignora — segue fluxo
        }
      }

      out.push({
        id: o.id,
        status: o.status as string,
        quantity: o.quantity,
        billing_cycle: o.billing_cycle as string,
        amount_cents: o.amount_cents,
        current_period_end: o.current_period_end,
        product_name: o.products?.name ?? "Plano",
        block_size: o.products?.block_size ?? 1,
        active_proxies: count ?? 0,
        has_stripe_sub: !!o.stripe_subscription_id,
        cancel_at_period_end: cancelAtPeriodEnd,
      });
    }

    return out;
  });

/**
 * Cancela a assinatura de um pedido do cliente.
 * - `immediate=false` (default): agenda cancelamento no Stripe pro fim do período (cliente mantém os proxies até lá).
 * - `immediate=true`: cancela imediatamente no Stripe, marca pedido como cancelado e libera proxies.
 *
 * Sempre grava motivo no audit_log e no Stripe (cancellation_details).
 */
const CANCEL_REASONS = [
  "too_expensive",
  "missing_features",
  "switched_service",
  "unused",
  "customer_service",
  "low_quality",
  "too_complex",
  "other",
] as const;

export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        reason: z.enum(CANCEL_REASONS),
        feedback: z.string().trim().max(1000).optional().default(""),
        immediate: z.boolean().optional().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, status, stripe_subscription_id, current_period_end, product_id")
      .eq("id", data.orderId)
      .maybeSingle();

    if (orderErr) throw new Error(orderErr.message);
    if (!order || order.user_id !== userId) {
      throw new Error("Pedido não encontrado");
    }
    if (order.status === "cancelled") {
      throw new Error("Este pedido já está cancelado");
    }

    const stripe = getStripe();
    let stripeStatus: string | null = null;
    let stripeCancelAt: string | null = null;

    if (stripe && order.stripe_subscription_id) {
      try {
        if (data.immediate) {
          const sub = await stripe.subscriptions.cancel(order.stripe_subscription_id, {
            cancellation_details: {
              comment: data.feedback || undefined,
              feedback: mapFeedback(data.reason),
            },
          });
          stripeStatus = sub.status;
        } else {
          const sub = await stripe.subscriptions.update(order.stripe_subscription_id, {
            cancel_at_period_end: true,
            cancellation_details: {
              comment: data.feedback || undefined,
              feedback: mapFeedback(data.reason),
            },
          });
          stripeStatus = sub.status;
          stripeCancelAt = sub.cancel_at
            ? new Date(sub.cancel_at * 1000).toISOString()
            : null;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabaseAdmin.from("audit_log").insert({
          user_id: userId,
          source: "customer_cancel",
          action: "stripe_cancel_failed",
          status: "error",
          request: { orderId: order.id, immediate: data.immediate, reason: data.reason },
          response: { error: msg },
        });
        throw new Error("Não foi possível cancelar a assinatura no provedor de pagamento. Tente novamente em instantes.");
      }
    }

    // Se for cancelamento imediato (ou se não havia assinatura ativa no Stripe),
    // marca o pedido como cancelado e libera os proxies.
    if (data.immediate || !order.stripe_subscription_id) {
      const { error: upErr } = await supabaseAdmin
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", order.id);
      if (upErr) throw new Error(upErr.message);

      await hideOrReleaseProxiesForOrder(order.id);
    }

    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      source: "customer_cancel",
      action: data.immediate ? "cancel_immediate" : "cancel_at_period_end",
      status: "ok",
      request: {
        orderId: order.id,
        reason: data.reason,
        feedback: data.feedback,
      },
      response: {
        stripe_status: stripeStatus,
        stripe_cancel_at: stripeCancelAt,
        period_end: order.current_period_end,
      },
    });

    return {
      ok: true,
      immediate: data.immediate,
      effective_at: data.immediate
        ? new Date().toISOString()
        : stripeCancelAt ?? order.current_period_end,
    };
  });

function mapFeedback(reason: typeof CANCEL_REASONS[number]):
  | "too_expensive"
  | "missing_features"
  | "switched_service"
  | "unused"
  | "customer_service"
  | "low_quality"
  | "too_complex"
  | "other" {
  return reason;
}

/**
 * Oferta de retenção: aplica um cupom de 30% OFF na PRÓXIMA fatura da
 * assinatura (once) e remove qualquer agendamento de cancelamento.
 * Cada pedido só pode receber a oferta UMA vez (checado via audit_log).
 */
export const applyRetentionDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ orderId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, status, stripe_subscription_id")
      .eq("id", data.orderId)
      .maybeSingle();

    if (!order || order.user_id !== userId) {
      throw new Error("Pedido não encontrado");
    }
    if (!order.stripe_subscription_id) {
      throw new Error("Assinatura não encontrada no provedor de pagamento");
    }

    const { data: prior } = await supabaseAdmin
      .from("audit_log")
      .select("id")
      .eq("user_id", userId)
      .eq("source", "customer_cancel")
      .eq("action", "retention_offer_accepted")
      .contains("request", { orderId: order.id })
      .limit(1);

    if (prior && prior.length > 0) {
      throw new Error("Esta oferta já foi usada nesta assinatura.");
    }

    const stripe = getStripe();
    if (!stripe) throw new Error("Stripe indisponível");

    const couponId = "fastproxy_retention_30off_once";
    try {
      await stripe.coupons.retrieve(couponId);
    } catch {
      await stripe.coupons.create({
        id: couponId,
        percent_off: 30,
        duration: "once",
        name: "Desconto de retencao 30%",
      });
    }

    try {
      await stripe.subscriptions.update(order.stripe_subscription_id, {
        discounts: [{ coupon: couponId }],
        cancel_at_period_end: false,
        cancellation_details: { comment: "retention_offer_accepted" },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("audit_log").insert({
        user_id: userId,
        source: "customer_cancel",
        action: "retention_offer_failed",
        status: "error",
        request: { orderId: order.id },
        response: { error: msg },
      });
      throw new Error("Nao foi possivel aplicar o desconto. Tente novamente.");
    }

    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      source: "customer_cancel",
      action: "retention_offer_accepted",
      status: "ok",
      request: { orderId: order.id },
      response: { coupon: couponId, percent_off: 30 },
    });

    return { ok: true, percent_off: 30 };
  });
