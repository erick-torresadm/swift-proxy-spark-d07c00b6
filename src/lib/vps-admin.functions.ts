import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const getVpsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const vps = await import("@/lib/fastproxy-vps.server");
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");

    const [health, blocks, settings, dbBlocks] = await Promise.all([
      vps.getHealth().catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
      vps.listBlocks().catch(() => []),
      supabaseAdmin
        .from("provider_settings")
        .select("dry_run")
        .eq("provider", "fastproxy_vps")
        .maybeSingle(),
      supabaseAdmin
        .from("provider_orders")
        .select("id, external_order_id, expires_at, quantity, status, created_at")
        .eq("provider", "fastproxy_vps")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const enabled = !((settings.data as { dry_run?: boolean } | null)?.dry_run ?? true);
    return {
      enabled,
      health,
      vpsBlocks: blocks,
      dbBlocks: dbBlocks.data ?? [],
    };
  });

export const setVpsEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { enabled: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
    const { error } = await supabaseAdmin
      .from("provider_settings")
      .upsert(
        { provider: "fastproxy_vps", dry_run: !data.enabled } as never,
        { onConflict: "provider" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, enabled: data.enabled };
  });
