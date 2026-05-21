// Server functions para envio de email.
// .functions.ts: client-safe import, executado server-side.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/supabase-custom/auth-middleware";
import {
  sendEmail,
  tplTest,
  tplOrderPaid,
  tplProxyDelivered,
  tplRenewalWarning,
  tplGracePeriod,
} from "./email.server";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

async function requireAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (data ?? []).some((r) => r.role === "admin");
  if (!isAdmin) throw new Error("Acesso negado");
}

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      to: z.string().email(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    await requireAdmin(userId);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .maybeSingle();

    const html = tplTest(profile?.full_name ?? undefined);
    const result = await sendEmail({
      to: data.to,
      subject: "Teste · Fast Proxy",
      html,
      tags: [{ name: "kind", value: "test" }],
    });
    if (!result.ok) throw new Error(result.error || "Falha ao enviar");
    return { ok: true, id: result.id };
  });

export const getEmailConfigStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    return {
      hasApiKey: Boolean(process.env.RESEND_API_KEY),
      from: process.env.EMAIL_FROM ?? "Fast Proxy <onboarding@resend.dev>",
      usingDefaultSender: !process.env.EMAIL_FROM,
    };
  });

// ----- Helpers chamados pelo motor de pedidos / cron (server-internal) -----
// Não expostos via createServerFn; importados diretamente quando necessário.

export async function notifyOrderPaid(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, amount_cents, quantity, product_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;

  const { data: product } = await supabaseAdmin
    .from("products")
    .select("name")
    .eq("id", order.product_id)
    .maybeSingle();

  if (!order.user_id) return;
  const { data: user } = await supabaseAdmin.auth.admin.getUserById(order.user_id);
  if (!user.user?.email) return;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("user_id", order.user_id)
    .maybeSingle();


  await sendEmail({
    to: user.user.email,
    subject: `Pagamento confirmado · ${product?.name ?? "Pedido"}`,
    html: tplOrderPaid({
      customerName: profile?.full_name ?? undefined,
      productName: product?.name ?? "Plano",
      quantity: order.quantity,
      amountBRL: (order.amount_cents / 100).toFixed(2).replace(".", ","),
      orderId: order.id,
    }),
    tags: [{ name: "kind", value: "order_paid" }, { name: "order_id", value: order.id }],
  });
}

export async function notifyProxyDelivered(userId: string, count: number) {
  const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (!user.user?.email) return;
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
  await sendEmail({
    to: user.user.email,
    subject: "Seus proxies estão prontos",
    html: tplProxyDelivered({ customerName: profile?.full_name ?? undefined, count }),
    tags: [{ name: "kind", value: "proxy_delivered" }],
  });
}

export async function notifyRenewalWarning(userId: string, productName: string, daysLeft: number) {
  const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (!user.user?.email) return;
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
  await sendEmail({
    to: user.user.email,
    subject: `Renovação em ${daysLeft} dias · ${productName}`,
    html: tplRenewalWarning({
      customerName: profile?.full_name ?? undefined, productName, daysLeft,
    }),
    tags: [{ name: "kind", value: "renewal_warning" }],
  });
}

export async function notifyGracePeriod(userId: string, daysLeft: number) {
  const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (!user.user?.email) return;
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
  await sendEmail({
    to: user.user.email,
    subject: "Pagamento pendente · ação necessária",
    html: tplGracePeriod({ customerName: profile?.full_name ?? undefined, daysLeft }),
    tags: [{ name: "kind", value: "grace_period" }],
  });
}
