import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const subscribePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        endpoint: z.string().url(),
        p256dh: z.string().min(1),
        auth: z.string().min(1),
        userAgent: z.string().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent ?? null,
        last_seen_at: new Date().toISOString(),
        failed_count: 0,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unsubscribePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ endpoint: z.string().url() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", context.userId)
      .eq("endpoint", data.endpoint);
    return { ok: true };
  });

export const listMyNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await supabaseAdmin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const sendTestNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { enqueueNotification } = await import("./notifications.server");
    await enqueueNotification({
      userId: context.userId,
      kind: "system",
      title: "Tudo certo! 🎉",
      body: "Você vai receber avisos sobre expiração, renovação e novidades.",
      link: "/dashboard",
      dedupeKey: `test-${Date.now()}`,
      sendImmediately: true,
    });
    return { ok: true };
  });

/** Quantos proxies do usuário expiram nos próximos 7 dias (badge). */
export const getExpiringCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const horizon = new Date(Date.now() + 7 * 86400_000).toISOString();
    const { count } = await supabaseAdmin
      .from("customer_proxies")
      .select("orders!inner(current_period_end)", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .neq("status", "released")
      .lte("orders.current_period_end", horizon);
    return { count: count ?? 0 };
  });

/** Remove TODAS as inscrições push do usuário (todos os dispositivos). */
export const disableAllPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", context.userId);
    return { ok: true };
  });
