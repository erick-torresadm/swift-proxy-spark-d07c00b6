import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function clientIp(): string | null {
  return (
    getRequestHeader("cf-connecting-ip") ??
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
    getRequestHeader("x-real-ip") ??
    null
  );
}

const StartSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  subject: z.string().trim().max(160).optional().or(z.literal("")),
  message: z.string().trim().min(1).max(2000),
  guestToken: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

export const startConversation = createServerFn({ method: "POST" })
  .inputValidator((input) => StartSchema.parse(input))
  .handler(async ({ data }) => {
    const ip = clientIp();
    let convId: string | null = null;

    // Tenta achar conversa em aberto para esse user/guest
    if (data.userId) {
      const { data: existing } = await supabaseAdmin
        .from("chat_conversations")
        .select("id")
        .eq("user_id", data.userId)
        .in("status", ["waiting", "active"])
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) convId = existing.id;
    } else if (data.guestToken) {
      const { data: existing } = await supabaseAdmin
        .from("chat_conversations")
        .select("id")
        .eq("guest_token", data.guestToken)
        .in("status", ["waiting", "active"])
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) convId = existing.id;
    }

    if (!convId) {
      const { data: created, error } = await supabaseAdmin
        .from("chat_conversations")
        .insert({
          user_id: data.userId ?? null,
          guest_token: data.userId ? null : (data.guestToken ?? crypto.randomUUID()),
          guest_name: data.name,
          guest_email: data.email || null,
          guest_phone: data.phone || null,
          guest_ip: ip,
          subject: data.subject || null,
        })
        .select("id, guest_token")
        .single();
      if (error) throw new Error(error.message);
      convId = created.id;
    }

    const { error: msgErr } = await supabaseAdmin.from("chat_messages").insert({
      conversation_id: convId,
      sender: "client",
      sender_user_id: data.userId ?? null,
      body: data.message,
    });
    if (msgErr) throw new Error(msgErr.message);

    const { data: conv } = await supabaseAdmin
      .from("chat_conversations")
      .select("id, guest_token")
      .eq("id", convId)
      .single();

    return { conversationId: convId, guestToken: conv?.guest_token ?? null };
  });

const GuestSendSchema = z.object({
  conversationId: z.string().uuid(),
  guestToken: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

export const guestSendMessage = createServerFn({ method: "POST" })
  .inputValidator((input) => GuestSendSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: conv, error } = await supabaseAdmin
      .from("chat_conversations")
      .select("id, guest_token, user_id")
      .eq("id", data.conversationId)
      .single();
    if (error || !conv) throw new Error("Conversa não encontrada");
    if (conv.user_id) throw new Error("Conversa de cliente autenticado");
    if (conv.guest_token !== data.guestToken) throw new Error("Token inválido");

    const { error: insErr } = await supabaseAdmin.from("chat_messages").insert({
      conversation_id: conv.id,
      sender: "client",
      body: data.body,
    });
    if (insErr) throw new Error(insErr.message);
    return { ok: true };
  });

const GuestPollSchema = z.object({
  conversationId: z.string().uuid(),
  guestToken: z.string().uuid(),
});

export const guestGetMessages = createServerFn({ method: "POST" })
  .inputValidator((input) => GuestPollSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: conv } = await supabaseAdmin
      .from("chat_conversations")
      .select("id, guest_token, status")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv || conv.guest_token !== data.guestToken) {
      throw new Error("Conversa inválida");
    }
    const { data: msgs } = await supabaseAdmin
      .from("chat_messages")
      .select("id, sender, body, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    // marca lidas para cliente
    await supabaseAdmin
      .from("chat_conversations")
      .update({ unread_client: 0 })
      .eq("id", data.conversationId);
    return { messages: msgs ?? [], status: conv.status };
  });

// ===== Cliente autenticado =====
export const clientSendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      conversationId: z.string().uuid(),
      body: z.string().trim().min(1).max(2000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conv } = await supabase
      .from("chat_conversations")
      .select("id, user_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv || conv.user_id !== userId) throw new Error("Sem acesso");
    const { error } = await supabase.from("chat_messages").insert({
      conversation_id: data.conversationId,
      sender: "client",
      sender_user_id: userId,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clientMarkRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("chat_conversations")
      .update({ unread_client: 0 })
      .eq("id", data.conversationId);
    return { ok: true };
  });

// ===== Admin =====
async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Acesso negado");
}

export const adminListConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      status: z.enum(["waiting", "active", "closed", "all"]).default("all"),
      search: z.string().trim().max(200).optional(),
    }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("chat_conversations")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(
        `guest_name.ilike.${s},guest_email.ilike.${s},guest_phone.ilike.${s},guest_ip.ilike.${s},id.eq.${data.search}`,
      );
    }
    const { data: convs, error } = await q;
    if (error) throw new Error(error.message);

    // junta nome do profile para conversas autenticadas
    const userIds = (convs ?? []).map((c) => c.user_id).filter(Boolean) as string[];
    let profilesMap = new Map<string, { full_name: string | null }>();
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      for (const p of profs ?? []) profilesMap.set(p.user_id, { full_name: p.full_name });
    }
    return {
      conversations: (convs ?? []).map((c) => ({
        ...c,
        profile_name: c.user_id ? profilesMap.get(c.user_id)?.full_name ?? null : null,
      })),
    };
  });

export const adminGetMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: msgs } = await supabaseAdmin
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    await supabaseAdmin
      .from("chat_conversations")
      .update({ unread_admin: 0, assigned_admin_id: context.userId, status: "active" })
      .eq("id", data.conversationId);
    return { messages: msgs ?? [] };
  });

export const adminSendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      conversationId: z.string().uuid(),
      body: z.string().trim().min(1).max(2000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("chat_messages").insert({
      conversation_id: data.conversationId,
      sender: "admin",
      sender_user_id: context.userId,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("chat_conversations")
      .update({ assigned_admin_id: context.userId, status: "active" })
      .eq("id", data.conversationId);
    return { ok: true };
  });

export const adminCloseConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await supabaseAdmin
      .from("chat_conversations")
      .update({ status: "closed" })
      .eq("id", data.conversationId);
    return { ok: true };
  });

// Para o cliente autenticado listar suas conversas
export const clientListMyConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("chat_conversations")
      .select("*")
      .eq("user_id", context.userId)
      .in("status", ["waiting", "active"])
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return { conversation: null, messages: [] };
    const { data: msgs } = await context.supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", data.id)
      .order("created_at", { ascending: true });
    return { conversation: data, messages: msgs ?? [] };
  });
