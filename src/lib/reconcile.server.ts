/**
 * Reconcilia um pedido com a verdade do Stripe.
 *
 * Usado por:
 *  - webhook (fallback se o evento chegar antes do nosso DB estar consistente);
 *  - página /checkout/success (caso o webhook ainda não tenha chegado);
 *  - cron stripe-sync (para pedidos pending com session id).
 *
 * Idempotente: se já estiver "paid" e alocado, não faz nada.
 */
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { getStripe } from "./stripe.server";
import { allocateProxiesForOrder } from "./allocation.server";
import { notifyAllAdmins } from "./notifications.server";


export async function reconcileOrderWithStripe(orderId: string): Promise<{
  status: string;
  allocated: number;
  short: number;
  changed: boolean;
  reason?: string;
}> {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select(
      "id, status, user_id, customer_email, stripe_checkout_session_id, stripe_subscription_id, stripe_customer_id",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { status: "missing", allocated: 0, short: 0, changed: false, reason: "order not found" };

  let changed = false;

  // Já pago: só roda allocate idempotente
  if (order.status === "paid") {
    const r = await allocateProxiesForOrder(orderId);
    return { status: "paid", allocated: r.allocated, short: r.short, changed: false };
  }

  if (!order.stripe_checkout_session_id) {
    return { status: order.status as string, allocated: 0, short: 0, changed: false, reason: "no session id" };
  }

  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
  } catch (e) {
    return {
      status: order.status as string,
      allocated: 0,
      short: 0,
      changed: false,
      reason: `stripe retrieve failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (session.payment_status !== "paid") {
    return {
      status: order.status as string,
      allocated: 0,
      short: 0,
      changed: false,
      reason: `session payment_status=${session.payment_status}`,
    };
  }

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

  let periodEnd: string | null = null;
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const ts = (sub as unknown as { current_period_end?: number }).current_period_end;
      if (ts) periodEnd = new Date(ts * 1000).toISOString();
    } catch {
      /* ignore */
    }
  }

  // Auto-provisão de user_id se vier email no Stripe e ainda não houver vínculo.
  let userId = order.user_id ?? null;
  const emailFromStripe =
    (session.metadata?.customer_email as string | undefined) ??
    session.customer_details?.email ??
    session.customer_email ??
    order.customer_email ??
    null;

  if (!userId && emailFromStripe) {
    try {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      userId =
        list.users.find((u) => u.email?.toLowerCase() === emailFromStripe.toLowerCase())?.id ?? null;
      if (!userId) {
        const { data: invited } = await supabaseAdmin.auth.admin.inviteUserByEmail(emailFromStripe, {
          data: {
            full_name:
              (session.metadata?.customer_name as string | undefined) ??
              session.customer_details?.name ??
              undefined,
          },
        });
        userId = invited.user?.id ?? null;
      }
    } catch {
      /* ignore — só não bloqueia o resto */
    }
  }

  const updates: Record<string, unknown> = {
    status: "paid",
    last_payment_check_at: new Date().toISOString(),
    grace_until: null,
  };
  if (subscriptionId) updates.stripe_subscription_id = subscriptionId;
  if (customerId) updates.stripe_customer_id = customerId;
  if (periodEnd) updates.current_period_end = periodEnd;
  if (userId && !order.user_id) updates.user_id = userId;
  if (emailFromStripe && emailFromStripe !== order.customer_email) {
    updates.customer_email = emailFromStripe;
  }

  await supabaseAdmin.from("orders").update(updates as never).eq("id", orderId);
  changed = true;

  await supabaseAdmin.from("audit_log").insert({
    source: "reconcile",
    action: "order_paid",
    status: "ok",
    request: { orderId, sessionId: order.stripe_checkout_session_id } as never,
    response: { subscriptionId, customerId, periodEnd, userId } as never,
  });

  // 🔔 Alerta admin: nova venda (fallback quando webhook não chega)
  try {
    const { data: ord } = await supabaseAdmin
      .from("orders")
      .select("amount_cents, quantity, customer_email, billing_cycle, products(name, slug)")
      .eq("id", orderId)
      .maybeSingle();
    const prod = (ord as unknown as { products?: { name?: string; slug?: string } })?.products ?? null;
    const amount = ((ord?.amount_cents ?? 0) / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    await notifyAllAdmins({
      title: "💸 Nova venda",
      body: `${prod?.name ?? "Produto"} × ${ord?.quantity ?? 1} — ${amount} (${ord?.billing_cycle ?? "monthly"}) · ${ord?.customer_email ?? emailFromStripe ?? "cliente"}`,
      link: `/admin/orders`,
      metadata: { orderId, productSlug: prod?.slug, via: "reconcile" },
      dedupeKey: `sale:${orderId}`,
    });
  } catch (e) {
    console.error("admin sale notify (reconcile) failed", e);
  }


  // Aloca
  let allocated = 0;
  let short = 0;
  try {
    const r = await allocateProxiesForOrder(orderId);
    allocated = r.allocated;
    short = r.short;
  } catch (e) {
    return {
      status: "paid",
      allocated: 0,
      short: 0,
      changed,
      reason: `allocate failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  return { status: "paid", allocated, short, changed };
}
