import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/supabase-custom/auth-middleware";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { getStripe } from "@/lib/stripe.server";


async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("forbidden");
}

/* -------------------------- LIST ALLOCATIONS -------------------------- */
export const listAllocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data: allocs } = await supabaseAdmin
      .from("customer_proxies")
      .select(
        "id, user_id, status, allocated_at, order_id, stock_id, proxy_stock(host, port, username, country_code, protocol, product_id), orders(grace_until, products(name, slug))",
      )
      .neq("status", "released")
      .order("allocated_at", { ascending: false })
      .limit(500);

    const userIds = Array.from(new Set((allocs ?? []).map((a) => a.user_id)));
    const stockIds = Array.from(
      new Set((allocs ?? []).map((a) => a.stock_id).filter(Boolean) as string[]),
    );

    const [{ data: profiles }, { data: issues }] = await Promise.all([
      userIds.length
        ? supabaseAdmin
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", userIds)
        : Promise.resolve({ data: [] as { user_id: string; full_name: string | null }[] }),
      stockIds.length
        ? supabaseAdmin
            .from("proxy_health_events")
            .select("stock_id, event, detected_at")
            .is("resolved_at", null)
            .in("stock_id", stockIds)
        : Promise.resolve({ data: [] as { stock_id: string | null; event: string; detected_at: string }[] }),
    ]);

    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.user_id, p.full_name]),
    );
    const issueMap = new Map<string, { event: string; detected_at: string }>();
    for (const i of issues ?? []) {
      if (i.stock_id && !issueMap.has(i.stock_id)) {
        issueMap.set(i.stock_id, { event: i.event, detected_at: i.detected_at });
      }
    }

    return (allocs ?? []).map((a) => ({
      id: a.id,
      user_id: a.user_id,
      user_name: profileMap.get(a.user_id) ?? null,
      status: a.status as string,
      allocated_at: a.allocated_at,
      order_id: a.order_id,
      stock_id: a.stock_id,
      product_name: a.orders?.products?.name ?? "—",
      product_id: a.proxy_stock?.product_id ?? null,
      host: a.proxy_stock?.host ?? null,
      port: a.proxy_stock?.port ?? null,
      username: a.proxy_stock?.username ?? null,
      country_code: a.proxy_stock?.country_code ?? null,
      protocol: a.proxy_stock?.protocol ?? "http",
      grace_until: a.orders?.grace_until ?? null,
      issue: a.stock_id ? issueMap.get(a.stock_id) ?? null : null,
    }));
  });

/* -------------------------- SWAP PROXY -------------------------- */
export const adminSwapProxy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      allocationId: z.string().uuid(),
      reason: z.string().min(2).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: row } = await supabaseAdmin
      .from("customer_proxies")
      .select("id, stock_id, user_id, status")
      .eq("id", data.allocationId)
      .maybeSingle();

    if (!row || !row.stock_id) throw new Error("Alocação não encontrada");
    if (row.status === "released") throw new Error("Alocação já foi liberada");

    const { data: currentStock } = await supabaseAdmin
      .from("proxy_stock")
      .select("id, product_id, host")
      .eq("id", row.stock_id)
      .maybeSingle();
    if (!currentStock) throw new Error("Estoque atual não encontrado");

    const { data: available } = await supabaseAdmin
      .from("proxy_stock")
      .select("id, host")
      .eq("product_id", currentStock.product_id)
      .eq("status", "available")
      .neq("id", currentStock.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!available) {
      throw new Error("Sem IPs disponíveis no estoque deste produto.");
    }

    // Aloca novo, marca antigo como removed (defeito) e libera alocação
    const { error: e1 } = await supabaseAdmin
      .from("proxy_stock")
      .update({ status: "allocated" })
      .eq("id", available.id)
      .eq("status", "available");
    if (e1) throw new Error(e1.message);

    await supabaseAdmin
      .from("proxy_stock")
      .update({ status: "removed" })
      .eq("id", currentStock.id);

    const { error: e2 } = await supabaseAdmin
      .from("customer_proxies")
      .update({ stock_id: available.id })
      .eq("id", row.id);
    if (e2) throw new Error(e2.message);

    // Audita e resolve evento health pendente do estoque antigo
    await supabaseAdmin.from("audit_log").insert({
      source: "admin",
      action: "swap_proxy",
      status: "ok",
      user_id: context.userId,
      request: {
        allocation_id: row.id,
        from_stock: currentStock.id,
        to_stock: available.id,
        reason: data.reason,
      },
    } as never);

    await supabaseAdmin
      .from("proxy_health_events")
      .update({ resolved_at: new Date().toISOString() })
      .eq("stock_id", currentStock.id)
      .is("resolved_at", null);

    // Notifica cliente
    await supabaseAdmin.from("notifications").insert({
      user_id: row.user_id,
      kind: "system",
      title: "Seu proxy foi substituído",
      body: `Um IP novo foi atribuído à sua conta. Motivo: ${data.reason}.`,
      link: "/dashboard/proxies",
    } as never);

    return { ok: true, new_host: available.host };
  });

/* -------------------------- RELEASE PROXY -------------------------- */
export const adminReleaseProxy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      allocationId: z.string().uuid(),
      reason: z.string().min(2).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: row } = await supabaseAdmin
      .from("customer_proxies")
      .select("id, stock_id, user_id")
      .eq("id", data.allocationId)
      .maybeSingle();
    if (!row) throw new Error("Alocação não encontrada");

    await supabaseAdmin
      .from("customer_proxies")
      .update({ status: "released", released_at: new Date().toISOString() })
      .eq("id", row.id);

    if (row.stock_id) {
      await supabaseAdmin
        .from("proxy_stock")
        .update({ status: "available" })
        .eq("id", row.stock_id);
    }

    await supabaseAdmin.from("audit_log").insert({
      source: "admin",
      action: "release_proxy",
      status: "ok",
      user_id: context.userId,
      request: { allocation_id: row.id, reason: data.reason },
    } as never);

    return { ok: true };
  });

/* -------------------------- REPORT ISSUE (CLIENTE) -------------------------- */
export const reportProxyIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      allocationId: z.string().uuid(),
      message: z.string().min(2).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("customer_proxies")
      .select("id, stock_id, user_id, proxy_stock(host, external_proxy_id)")
      .eq("id", data.allocationId)
      .maybeSingle();
    if (!row || row.user_id !== context.userId) {
      throw new Error("Alocação não encontrada");
    }

    await supabaseAdmin.from("proxy_health_events").insert({
      stock_id: row.stock_id,
      external_proxy_id: row.proxy_stock?.external_proxy_id ?? null,
      event: "customer_report",
      details: { message: data.message, user_id: context.userId },
    } as never);

    return { ok: true };
  });

/* -------------------------- LIST OPEN ISSUES (ADMIN) -------------------------- */
export const listOpenIssues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("proxy_health_events")
      .select("id, event, detected_at, details, stock_id, external_proxy_id")
      .is("resolved_at", null)
      .order("detected_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const countOpenIssues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { count } = await supabaseAdmin
      .from("proxy_health_events")
      .select("*", { count: "exact", head: true })
      .is("resolved_at", null);
    return { count: count ?? 0 };
  });

/* -------------------------- CUSTOMER DETAIL (entitlements) -------------------------- */
export const getCustomerDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const [{ data: profile }, { data: authUser }] = await Promise.all([
      supabaseAdmin.from("profiles").select("user_id, full_name, phone, created_at").eq("user_id", data.userId).maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(data.userId),
    ]);
    const email = authUser?.user?.email ?? null;

    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id, status, quantity, billing_cycle, amount_cents, customer_email, stripe_subscription_id, stripe_customer_id, current_period_end, grace_until, created_at, product_id, products(id, name, slug, category, country_code, block_size)")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false });

    let stripe: ReturnType<typeof getStripe> | null = null;
    try { stripe = getStripe(); } catch { /* no key */ }

    const enriched = await Promise.all((orders ?? []).map(async (o) => {
      const product = o.products as { id: string; name: string; slug: string; category: string; country_code: string | null; block_size: number } | null;
      const blockSize = product?.block_size ?? 1;
      const needed = (o.quantity ?? 1) * blockSize;

      const { count: allocatedCount } = await supabaseAdmin
        .from("customer_proxies")
        .select("*", { count: "exact", head: true })
        .eq("order_id", o.id)
        .neq("status", "released");

      const availableStock = product
        ? (await supabaseAdmin
            .from("proxy_stock")
            .select("*", { count: "exact", head: true })
            .eq("product_id", product.id)
            .eq("status", "available")).count ?? 0
        : 0;

      let stripeStatus: string | null = null;
      let stripePeriodEnd: string | null = null;
      if (stripe && o.stripe_subscription_id) {
        try {
          const sub = await stripe.subscriptions.retrieve(o.stripe_subscription_id);
          stripeStatus = sub.status;
          const ts = (sub as unknown as { current_period_end?: number }).current_period_end;
          if (ts) stripePeriodEnd = new Date(ts * 1000).toISOString();
        } catch (e) {
          stripeStatus = `error: ${e instanceof Error ? e.message : "unknown"}`;
        }
      }

      return {
        id: o.id,
        status: o.status as string,
        quantity: o.quantity,
        billing_cycle: o.billing_cycle,
        amount_cents: o.amount_cents,
        customer_email: o.customer_email,
        stripe_subscription_id: o.stripe_subscription_id,
        current_period_end: o.current_period_end,
        grace_until: o.grace_until,
        created_at: o.created_at,
        product,
        needed,
        allocated: allocatedCount ?? 0,
        shortage: Math.max(0, needed - (allocatedCount ?? 0)),
        available_stock: availableStock,
        stripe_status: stripeStatus,
        stripe_period_end: stripePeriodEnd,
      };
    }));

    return {
      profile: profile ?? { user_id: data.userId, full_name: null, phone: null, created_at: null },
      email,
      orders: enriched,
    };
  });

/* -------------------------- MANUAL ALLOCATE (admin) -------------------------- */
export const adminManualAllocate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orderId: z.string().uuid(),
      stockId: z.string().uuid().optional(),
      syncStripe: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, product_id, quantity, status, customer_email, stripe_subscription_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("Pedido não encontrado");
    if (!order.user_id) throw new Error("Pedido sem user_id");

    if (!order.customer_email) {
      const { data: au } = await supabaseAdmin.auth.admin.getUserById(order.user_id);
      const email = au?.user?.email ?? null;
      if (email) {
        await supabaseAdmin.from("orders").update({ customer_email: email } as never).eq("id", order.id);
        order.customer_email = email;
      }
    }

    if (data.syncStripe && order.stripe_subscription_id) {
      try {
        const stripe = getStripe();
        const sub = await stripe.subscriptions.retrieve(order.stripe_subscription_id);
        const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
        const patch: Record<string, unknown> = { last_payment_check_at: new Date().toISOString() };
        if (periodEnd) patch.current_period_end = new Date(periodEnd * 1000).toISOString();
        if (sub.status === "active" || sub.status === "trialing") {
          patch.status = "paid"; patch.grace_until = null;
          order.status = "paid";
        } else if (sub.status === "past_due" || sub.status === "unpaid") {
          patch.status = "past_due";
          order.status = "past_due";
        } else if (sub.status === "canceled") {
          patch.status = "cancelled";
          order.status = "cancelled";
        }
        await supabaseAdmin.from("orders").update(patch as never).eq("id", order.id);
      } catch (e) {
        throw new Error(`Stripe: ${e instanceof Error ? e.message : "erro"}`);
      }
    }

    const allowedStatuses = ["paid", "past_due", "grace"];
    if (!allowedStatuses.includes(order.status as string)) {
      throw new Error(`Pedido com status "${order.status}" não tem direito a proxy. Sincronize com Stripe primeiro.`);
    }

    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id, block_size, name")
      .eq("id", order.product_id)
      .maybeSingle();
    if (!product) throw new Error("Produto não encontrado");

    const needed = (order.quantity ?? 1) * (product.block_size ?? 1);
    const { count: allocated } = await supabaseAdmin
      .from("customer_proxies")
      .select("*", { count: "exact", head: true })
      .eq("order_id", order.id)
      .neq("status", "released");

    if ((allocated ?? 0) >= needed) {
      throw new Error(`Pedido já tem ${allocated} de ${needed} proxies alocados.`);
    }

    let stockId = data.stockId;
    if (stockId) {
      const { data: chk } = await supabaseAdmin
        .from("proxy_stock")
        .select("id, status, product_id")
        .eq("id", stockId)
        .maybeSingle();
      if (!chk) throw new Error("Proxy de estoque não encontrado");
      if (chk.product_id !== product.id) throw new Error("Proxy não pertence ao produto deste pedido");
      if (chk.status !== "available") throw new Error(`Proxy não está disponível (${chk.status})`);
    } else {
      const { data: pick } = await supabaseAdmin
        .from("proxy_stock")
        .select("id")
        .eq("product_id", product.id)
        .eq("status", "available")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!pick) throw new Error("Sem proxies disponíveis no estoque deste produto");
      stockId = pick.id;
    }

    const { data: claim, error: claimErr } = await supabaseAdmin
      .from("proxy_stock")
      .update({ status: "allocated" } as never)
      .eq("id", stockId)
      .eq("status", "available")
      .select("id, host, port")
      .maybeSingle();
    if (claimErr || !claim) throw new Error("Não foi possível reservar o proxy (concorrência).");

    const { error: insErr } = await supabaseAdmin
      .from("customer_proxies")
      .insert({
        user_id: order.user_id,
        order_id: order.id,
        stock_id: stockId,
        status: "active",
      } as never);
    if (insErr) {
      await supabaseAdmin.from("proxy_stock").update({ status: "available" } as never).eq("id", stockId);
      throw new Error(insErr.message);
    }

    await supabaseAdmin.from("audit_log").insert({
      source: "admin",
      action: "manual_allocate",
      status: "ok",
      user_id: context.userId,
      request: {
        order_id: order.id,
        target_user_id: order.user_id,
        stock_id: stockId,
        product: product.name,
      },
    } as never);

    await supabaseAdmin.from("notifications").insert({
      user_id: order.user_id,
      kind: "system",
      title: "Novo proxy disponível",
      body: `Um proxy foi atribuído à sua conta (${product.name}).`,
      link: "/dashboard/proxies",
    } as never);

    return { ok: true, host: claim.host, port: claim.port };
  });

/* -------------------------- LIST AVAILABLE STOCK (admin picker) -------------------------- */
export const listAvailableStockForOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orderId: z.string().uuid(),
      showAllProducts: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, product_id, quantity, products(block_size, name)")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("Pedido não encontrado");

    const product = order.products as { block_size: number; name: string } | null;
    const needed = (order.quantity ?? 1) * (product?.block_size ?? 1);
    const { count: allocated } = await supabaseAdmin
      .from("customer_proxies")
      .select("*", { count: "exact", head: true })
      .eq("order_id", order.id)
      .neq("status", "released");

    let q = supabaseAdmin
      .from("proxy_stock")
      .select("id, host, port, username, protocol, country_code, expires_at, created_at, product_id, products(name)")
      .eq("status", "available")
      .order("created_at", { ascending: true })
      .limit(1000);
    if (!data.showAllProducts) q = q.eq("product_id", order.product_id);
    const { data: stock } = await q;

    return {
      product_name: product?.name ?? "—",
      order_product_id: order.product_id as string,
      needed,
      allocated: allocated ?? 0,
      shortage: Math.max(0, needed - (allocated ?? 0)),
      stock: (stock ?? []).map((s) => ({
        id: s.id,
        host: s.host,
        port: s.port,
        username: s.username,
        protocol: s.protocol,
        country_code: s.country_code,
        expires_at: s.expires_at,
        product_id: s.product_id,
        product_name: (s.products as { name?: string } | null)?.name ?? null,
        same_product: s.product_id === order.product_id,
      })),
    };
  });

/* -------------------------- BULK MANUAL ALLOCATE (admin) -------------------------- */
export const adminManualAllocateBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orderId: z.string().uuid(),
      stockIds: z.array(z.string().uuid()).min(1).max(200),
      ignoreShortageLimit: z.boolean().optional(),
      allowDifferentProduct: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, product_id, quantity, status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("Pedido não encontrado");
    if (!order.user_id) throw new Error("Pedido sem user_id");

    const allowed = ["paid", "past_due", "grace"];
    if (!allowed.includes(order.status as string)) {
      throw new Error(`Pedido com status "${order.status}" não tem direito a proxy.`);
    }

    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id, block_size, name")
      .eq("id", order.product_id)
      .maybeSingle();
    if (!product) throw new Error("Produto não encontrado");

    const needed = (order.quantity ?? 1) * (product.block_size ?? 1);
    const { count: allocated } = await supabaseAdmin
      .from("customer_proxies")
      .select("*", { count: "exact", head: true })
      .eq("order_id", order.id)
      .neq("status", "released");

    const remaining = Math.max(0, needed - (allocated ?? 0));
    if (!data.ignoreShortageLimit && data.stockIds.length > remaining) {
      throw new Error(`Pedido aceita só mais ${remaining} proxies (você selecionou ${data.stockIds.length}).`);
    }

    const succeeded: { stock_id: string; host: string; port: number }[] = [];
    const failed: { stock_id: string; reason: string }[] = [];

    for (const stockId of data.stockIds) {
      const { data: chk } = await supabaseAdmin
        .from("proxy_stock")
        .select("id, status, product_id")
        .eq("id", stockId)
        .maybeSingle();
      if (!chk) { failed.push({ stock_id: stockId, reason: "não encontrado" }); continue; }
      if (chk.product_id !== product.id && !data.allowDifferentProduct) { failed.push({ stock_id: stockId, reason: "produto diferente" }); continue; }
      if (chk.status !== "available") { failed.push({ stock_id: stockId, reason: chk.status }); continue; }

      const { data: claim, error: cErr } = await supabaseAdmin
        .from("proxy_stock")
        .update({ status: "allocated" } as never)
        .eq("id", stockId)
        .eq("status", "available")
        .select("id, host, port")
        .maybeSingle();
      if (cErr || !claim) { failed.push({ stock_id: stockId, reason: "concorrência" }); continue; }

      const { error: insErr } = await supabaseAdmin
        .from("customer_proxies")
        .insert({
          user_id: order.user_id,
          order_id: order.id,
          stock_id: stockId,
          status: "active",
        } as never);
      if (insErr) {
        await supabaseAdmin.from("proxy_stock").update({ status: "available" } as never).eq("id", stockId);
        failed.push({ stock_id: stockId, reason: insErr.message });
        continue;
      }
      succeeded.push({ stock_id: stockId, host: claim.host, port: claim.port });
    }

    await supabaseAdmin.from("audit_log").insert({
      source: "admin",
      action: "manual_allocate_bulk",
      status: failed.length === 0 ? "ok" : "partial",
      user_id: context.userId,
      request: { order_id: order.id, target_user_id: order.user_id, requested: data.stockIds.length },
      response: { succeeded_count: succeeded.length, failed_count: failed.length, failed },
    } as never);

    if (succeeded.length > 0) {
      await supabaseAdmin.from("notifications").insert({
        user_id: order.user_id,
        kind: "system",
        title: succeeded.length === 1 ? "Novo proxy disponível" : `${succeeded.length} novos proxies`,
        body: `Proxies atribuídos manualmente (${product.name}).`,
        link: "/dashboard/proxies",
      } as never);
    }

    return { succeeded, failed, allocated_count: succeeded.length };
  });


