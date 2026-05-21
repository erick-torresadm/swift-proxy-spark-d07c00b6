import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/supabase-custom/auth-middleware";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { z } from "zod";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("forbidden");
}

// Limite do free tier do Lovable Cloud / Supabase Free (500 MB DB)
export const FREE_TIER_DB_BYTES = 500 * 1024 * 1024;

export const getCloudUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [{ data: tables, error: tErr }, { data: totalRaw, error: sErr }] = await Promise.all([
      supabaseAdmin.rpc("get_db_usage"),
      supabaseAdmin.rpc("get_db_total_size"),
    ]);
    if (tErr) throw new Error(tErr.message);
    if (sErr) throw new Error(sErr.message);

    const totalBytes = Number(totalRaw ?? 0);
    const tablesList = (tables ?? []) as Array<{
      table_name: string;
      total_size_bytes: number;
      total_size_pretty: string;
      row_count: number;
      dead_rows: number;
    }>;

    return {
      totalBytes,
      freeLimitBytes: FREE_TIER_DB_BYTES,
      usedPercent: Math.min(100, (totalBytes / FREE_TIER_DB_BYTES) * 100),
      tables: tablesList.map((t) => ({
        name: t.table_name,
        bytes: Number(t.total_size_bytes),
        pretty: t.total_size_pretty,
        rows: Number(t.row_count),
        deadRows: Number(t.dead_rows),
      })),
    };
  });

const CleanupInput = z.object({
  auditDays: z.number().int().min(0).max(365).default(30),
  metricsDays: z.number().int().min(0).max(365).default(7),
  notificationsDays: z.number().int().min(0).max(365).default(30),
  closedChatsDays: z.number().int().min(0).max(365).default(60),
  analyze: z.boolean().default(true),
});

export const runCloudCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CleanupInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: result, error } = await supabaseAdmin.rpc("run_cleanup", {
      _audit_days: data.auditDays,
      _metrics_days: data.metricsDays,
      _notifications_days: data.notificationsDays,
      _closed_chats_days: data.closedChatsDays,
      _vacuum: data.analyze,
    });
    if (error) throw new Error(error.message);
    return { result };
  });
