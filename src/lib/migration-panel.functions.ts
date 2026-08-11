import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/supabase-custom/auth-middleware";
import { FP_SUPABASE_PUBLISHABLE_KEY, FP_SUPABASE_URL } from "@/lib/supabase-custom/config";

export type MigrationTable = {
  table_name: string;
  row_count: number;
  column_count: number;
  has_user_id: boolean;
};

export type MigrationBundle = {
  project_url: string;
  anon_key: string;
  service_role_key: string;
  secrets: Array<{ name: string; value: string }>;
  server_endpoints: string[];
  database_tables: MigrationTable[];
  tables_error: string | null;
};

const SYSTEM_VARS = new Set([
  "PATH", "HOME", "DENO_DIR", "HOSTNAME", "PORT", "TMPDIR", "USER", "LANG",
  "TERM", "_", "DENO_REGION", "DENO_DEPLOYMENT_ID", "PWD", "SHLVL", "SHELL",
  "NODE_ENV", "NODE_VERSION", "npm_config_user_agent", "OLDPWD", "LOGNAME",
  "LS_COLORS", "EDITOR", "PAGER", "TZ", "COLORTERM", "GIT_ASKPASS",
]);

function isSystemVar(name: string): boolean {
  if (SYSTEM_VARS.has(name)) return true;
  if (name.startsWith("XDG_")) return true;
  if (name.startsWith("npm_")) return true;
  if (name.startsWith("BUN_")) return true;
  if (name.startsWith("VITE_")) return true;
  if (name.startsWith("PG")) return true;
  if (name.startsWith("LOVABLE_BROWSER_")) return true;
  return false;
}

/**
 * Reúne tudo que é necessário para migrar o projeto para outro backend.
 * Restrito a administradores autenticados — os valores incluem chaves secretas.
 */
export const getMigrationBundle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MigrationBundle> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const env = process.env as Record<string, string | undefined>;
    const secrets = Object.keys(env)
      .filter((k) => !isSystemVar(k) && (env[k] ?? "") !== "")
      .sort()
      .map((name) => ({ name, value: env[name] as string }));

    const serviceRoleKey =
      env["FP_SUPABASE_SECRET_KEY"] ?? "";

    let database_tables: MigrationTable[] = [];
    let tables_error: string | null = null;
    try {
      const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
      const { data, error } = await supabaseAdmin.rpc("get_db_usage");
      if (error) throw new Error(error.message);
      database_tables = ((data ?? []) as Array<{ table_name: string; row_count: number }>).map(
        (t) => ({
          table_name: t.table_name,
          row_count: Number(t.row_count ?? 0),
          column_count: 0,
          has_user_id: false,
        }),
      );
    } catch (e) {
      tables_error = e instanceof Error ? e.message : String(e);
    }

    return {
      project_url: FP_SUPABASE_URL,
      anon_key: FP_SUPABASE_PUBLISHABLE_KEY,
      service_role_key: serviceRoleKey,
      secrets,
      server_endpoints: [
        "/api/public/stripe-webhook",
        "/api/public/hooks/stripe",
        "/api/public/hooks/stripe-sync",
        "/api/public/hooks/renewal-sweep",
        "/api/public/hooks/fulfillment-sweep",
        "/api/public/hooks/dunning-sweep",
        "/api/public/hooks/email-queue-worker",
        "/api/public/hooks/notifications-dispatch",
        "/api/public/hooks/engagement-nudges",
        "/api/public/hooks/proxyseller-sync",
        "/api/public/hooks/proxyseller-backfill",
        "/api/public/hooks/proxyseller-full-sync",
        "/api/public/hooks/resend-events",
        "/api/public/cron/healthcheck",
        "/api/public/blog/ingest",
      ],
      database_tables,
      tables_error,
    };
  });
