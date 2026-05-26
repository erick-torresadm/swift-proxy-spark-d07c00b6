import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/supabase-custom/auth-middleware";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { getStripe } from "./stripe.server";
import { allocateProxiesForOrder } from "./allocation.server";
import { reconcileOrderWithStripe } from "./reconcile.server";

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
        "id, status, quantity, billing_cycle, amount_cents, user_id, current_period_end, created_at, products(name, slug, block_size)",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return null;

    const { count: allocated } = await supabaseAdmin
      .from("customer_proxies")
      .select("*", { count: "exact", head: true })
      .eq("order_id", order.id)
      .neq("status", "released");

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
    };
  });

export const getMyOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const since = new Date(Date.now() - 30 * 86400000).toISOString();

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
      .neq("status", "released")
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

    // Rotação por SWAP de estoque: pega um proxy disponível do mesmo produto
    // e libera o atual de volta (status released). Não chama a API do provedor.
    const { data: currentStock } = await supabaseAdmin
      .from("proxy_stock")
      .select("id, product_id")
      .eq("id", row.stock_id as string)
      .maybeSingle();

    if (!currentStock) {
      throw new Error("Estoque atual não encontrado");
    }

    const { data: available, error: availErr } = await supabaseAdmin
      .from("proxy_stock")
      .select("id")
      .eq("product_id", currentStock.product_id)
      .eq("status", "available")
      .neq("id", currentStock.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (availErr) throw new Error(availErr.message);
    if (!available) {
      throw new Error("Sem IPs disponíveis em estoque para rotação no momento.");
    }

    // Aloca o novo estoque ao cliente e libera o anterior
    const { error: newStockErr } = await supabaseAdmin
      .from("proxy_stock")
      .update({ status: "allocated" })
      .eq("id", available.id)
      .eq("status", "available");
    if (newStockErr) throw new Error(newStockErr.message);

    const { error: relErr } = await supabaseAdmin
      .from("proxy_stock")
      .update({ status: "available" })
      .eq("id", currentStock.id);
    if (relErr) throw new Error(relErr.message);

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
        "id, user_id, status, billing_cycle, quantity, customer_email, products(name, stripe_price_monthly_id, stripe_price_yearly_id)",
      )
      .eq("id", data.orderId)
      .maybeSingle();

    if (!order || order.user_id !== context.userId) {
      throw new Error("Pedido não encontrado");
    }
    if (!["past_due", "grace", "pending"].includes(order.status as string)) {
      throw new Error("Pedido não precisa de reativação");
    }

    const priceId =
      order.billing_cycle === "yearly"
        ? order.products?.stripe_price_yearly_id
        : order.products?.stripe_price_monthly_id;

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
      process.env.PUBLIC_SITE_URL ?? "https://swift-proxy-spark.lovable.app";

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
      .in("status", ["paid", "past_due", "grace"]);

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
