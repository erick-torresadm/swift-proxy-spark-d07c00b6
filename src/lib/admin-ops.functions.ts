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
