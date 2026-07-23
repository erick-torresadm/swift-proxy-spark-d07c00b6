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

export type VpsStatus = {
  enabled: boolean;
  healthOk: boolean;
  healthError: string | null;
  healthJson: string;
  vpsBlocksJson: string;
  dbBlocks: Array<{
    id: string;
    external_order_id: string | null;
    expires_at: string | null;
    quantity: number;
    status: string | null;
    created_at: string;
  }>;
};

export const getVpsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VpsStatus> => {
    await assertAdmin(context.userId);
    const vps = await import("@/lib/fastproxy-vps.server");
    const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");

    let healthOk = true;
    let healthError: string | null = null;
    let healthJson = "{}";
    try {
      const h = await vps.getHealth();
      healthJson = JSON.stringify(h);
    } catch (e) {
      healthOk = false;
      healthError = e instanceof Error ? e.message : String(e);
    }

    let vpsBlocksJson = "[]";
    try {
      const bs = await vps.listBlocks();
      vpsBlocksJson = JSON.stringify(bs);
    } catch {
      /* ignore */
    }

    const { data: settings } = await supabaseAdmin
      .from("provider_settings")
      .select("dry_run")
      .eq("provider", "fastproxy_vps")
      .maybeSingle();

    const { data: dbBlocksRaw } = await supabaseAdmin
      .from("provider_orders")
      .select("id, external_order_id, expires_at, quantity, status, created_at")
      .eq("provider", "fastproxy_vps")
      .order("created_at", { ascending: false })
      .limit(50);

    const enabled = !((settings as { dry_run?: boolean } | null)?.dry_run ?? true);
    return {
      enabled,
      healthOk,
      healthError,
      healthJson,
      vpsBlocksJson,
      dbBlocks: (dbBlocksRaw ?? []).map((r) => ({
        id: r.id,
        external_order_id: r.external_order_id,
        expires_at: r.expires_at,
        quantity: r.quantity,
        status: r.status as string | null,
        created_at: r.created_at,
      })),
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
