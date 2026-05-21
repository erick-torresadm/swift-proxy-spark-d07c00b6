import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ROLE_VALUES = ["admin", "editor", "moderator", "customer"] as const;
type Role = (typeof ROLE_VALUES)[number];
const STAFF_ROLES: Role[] = ["admin", "editor", "moderator"];

async function getRoles(userId: string): Promise<Role[]> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  return (data ?? []).map((r) => r.role as Role);
}

async function assertAdmin(userId: string) {
  const roles = await getRoles(userId);
  if (!roles.includes("admin")) throw new Error("Acesso negado: apenas admin");
}

export const getMyStaffRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.userId);
    return {
      roles,
      isAdmin: roles.includes("admin"),
      canManageBlog: roles.some((r) => r === "admin" || r === "editor"),
      canModerateComments: roles.some(
        (r) => r === "admin" || r === "editor" || r === "moderator",
      ),
    };
  });

/* Lista todos os usuários com papel de equipe */
export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: rolesRows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role, created_at")
      .in("role", STAFF_ROLES)
      .order("created_at", { ascending: false });

    const userIds = Array.from(new Set((rolesRows ?? []).map((r) => r.user_id)));
    const { data: profiles } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", userIds)
      : { data: [] as Array<{ user_id: string; full_name: string | null; avatar_url: string | null }> };
    const profMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

    const byUser = new Map<
      string,
      { user_id: string; full_name: string | null; avatar_url: string | null; roles: Role[] }
    >();
    for (const r of rolesRows ?? []) {
      const existing = byUser.get(r.user_id);
      if (existing) {
        existing.roles.push(r.role as Role);
      } else {
        byUser.set(r.user_id, {
          user_id: r.user_id,
          full_name: profMap.get(r.user_id)?.full_name ?? null,
          avatar_url: profMap.get(r.user_id)?.avatar_url ?? null,
          roles: [r.role as Role],
        });
      }
    }
    return Array.from(byUser.values());
  });

/* Lista possíveis autores (admin + editor) */
export const listAuthors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: rolesRows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "editor"]);
    const ids = Array.from(new Set((rolesRows ?? []).map((r) => r.user_id)));
    if (!ids.length) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", ids);
    return (profiles ?? []).map((p) => ({
      user_id: p.user_id,
      full_name: p.full_name ?? "Sem nome",
    }));
  });

/* Busca usuário pelo email e atribui papel */
export const assignRoleByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email().max(255),
        role: z.enum(["admin", "editor", "moderator"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Busca usuário pelo email no auth (admin API)
    const lowered = data.email.trim().toLowerCase();
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) throw new Error(listErr.message);
    const found = list.users.find((u) => u.email?.toLowerCase() === lowered);
    if (!found) {
      throw new Error("Usuário não encontrado. Peça para essa pessoa criar uma conta primeiro.");
    }

    // Insere papel (evita duplicado)
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: found.id, role: data.role });
    if (error && !error.message.toLowerCase().includes("duplicate")) {
      throw new Error(error.message);
    }
    return { ok: true, user_id: found.id };
  });

export const removeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["admin", "editor", "moderator"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Proteção: não remover o último admin
    if (data.role === "admin") {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) {
        throw new Error("Não é possível remover o último admin.");
      }
    }

    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    return { ok: true };
  });
