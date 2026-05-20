import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
        "id, status, quantity, billing_cycle, amount_cents, customer_email, user_id, current_period_end, created_at, products(name, slug, block_size)",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return null;

    const { count: allocated } = await supabaseAdmin
      .from("customer_proxies")
      .select("*", { count: "exact", head: true })
      .eq("order_id", order.id)
      .neq("status", "released");

    // mask email lightly
    const email = order.customer_email ?? "";
    const maskedEmail = email.replace(
      /^([^@]{1,2})[^@]*(@.*)$/,
      (_, a, b) => `${a}***${b}`,
    );

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
      masked_email: maskedEmail,
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
        "id, status, allocated_at, order_id, proxy_stock(host, port, username, password, protocol, country_code), orders(products(name, slug))",
      )
      .eq("user_id", context.userId)
      .neq("status", "released")
      .order("allocated_at", { ascending: false });

    return (data ?? []).map((r) => ({
      id: r.id,
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
    }));
  });

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("orders")
      .select(
        "id, status, quantity, billing_cycle, amount_cents, current_period_end, created_at, products(name, slug, block_size)",
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
      created_at: o.created_at,
      product_name: o.products?.name ?? "Plano",
      block_size: o.products?.block_size ?? 1,
    }));
  });
