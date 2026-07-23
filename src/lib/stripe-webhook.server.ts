import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import {
  allocateProxiesForOrder,
  hideOrReleaseProxiesForOrder,
  renewProxyBlocksForOrder,
  restoreHiddenProxiesForPaidOrder,
} from "@/lib/allocation.server";
import { notifyAllAdmins } from "@/lib/notifications.server";
import { getStripe } from "@/lib/stripe.server";
import type Stripe from "stripe";

async function logAudit(action: string, status: string, payload: unknown, error?: string) {
  try {
    await supabaseAdmin.from("audit_log").insert({
      source: "stripe_webhook",
      action,
      status,
      request: payload as never,
      response: error ? ({ error } as never) : null,
    });
  } catch {
    /* ignore */
  }
}

type EventRow = {
  id: string;
  type: string;
  livemode?: boolean;
  occurred_at?: string;
  customer_email?: string | null;
  customer_id?: string | null;
  subscription_id?: string | null;
  invoice_id?: string | null;
  charge_id?: string | null;
  payment_intent_id?: string | null;
  session_id?: string | null;
  order_id?: string | null;
  amount_cents?: number | null;
  currency?: string | null;
  status?: string | null;
  reason?: string | null;
  raw?: unknown;
};

async function recordStripeEvent(row: EventRow) {
  try {
    await supabaseAdmin.from("stripe_events").upsert(row as never, { onConflict: "id" });
  } catch (err) {
    await logAudit("record_stripe_event", "error", { id: row.id }, err instanceof Error ? err.message : String(err));
  }
}

function invoiceSubscriptionId(inv: Stripe.Invoice): string | null {
  const raw = inv as unknown as {
    subscription?: string | { id?: string } | null;
    subscription_details?: { subscription?: string | null } | null;
    parent?: { subscription_details?: { subscription?: string | null } | null } | null;
  };
  if (typeof raw.subscription === "string") return raw.subscription;
  if (raw.subscription?.id) return raw.subscription.id;
  return raw.subscription_details?.subscription ?? raw.parent?.subscription_details?.subscription ?? null;
}

function invoicePeriodEnd(inv: Stripe.Invoice): number | null {
  return (inv.lines?.data?.[0] as unknown as { period?: { end?: number } } | undefined)?.period?.end ?? null;
}

async function getSubscriptionPeriodEnd(subscriptionId: string | null | undefined) {
  if (!subscriptionId) return null;
  try {
    const sub = await getStripe().subscriptions.retrieve(subscriptionId);
    const shaped = sub as unknown as {
      current_period_end?: number | null;
      items?: { data?: Array<{ current_period_end?: number | null }> };
    };
    return shaped.current_period_end ?? shaped.items?.data?.[0]?.current_period_end ?? null;
  } catch {
    return null;
  }
}

async function attachUserToOrder(orderId: string, email: string | null, name: string | null) {
  if (!email) return;
  const { data: existingOrder } = await supabaseAdmin
    .from("orders")
    .select("user_id")
    .eq("id", orderId)
    .maybeSingle();
  if (existingOrder?.user_id) return;

  let userId: string | null = null;
  try {
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    userId = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
  } catch {
    /* ignore */
  }

  if (!userId) {
    try {
      const { data: invited } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: name ?? undefined },
      });
      userId = invited.user?.id ?? null;
    } catch (err) {
      await logAudit("auto_provision_user", "error", { email }, err instanceof Error ? err.message : String(err));
    }
  }

  if (userId) await supabaseAdmin.from("orders").update({ user_id: userId }).eq("id", orderId);
}

async function markOrderPaid(opts: {
  orderId?: string | null;
  sessionId?: string | null;
  subscriptionId?: string | null;
  customerId?: string | null;
  currentPeriodEnd?: number | null;
  promoCode?: string | null;
  discountCents?: number | null;
}) {
  const updates: Record<string, unknown> = {
    status: "paid",
    last_payment_check_at: new Date().toISOString(),
    grace_until: null,
  };
  if (opts.subscriptionId) updates.stripe_subscription_id = opts.subscriptionId;
  if (opts.customerId) updates.stripe_customer_id = opts.customerId;
  if (opts.currentPeriodEnd) updates.current_period_end = new Date(opts.currentPeriodEnd * 1000).toISOString();
  if (opts.promoCode) updates.promo_code = opts.promoCode;
  if (typeof opts.discountCents === "number") updates.discount_cents = opts.discountCents;

  let query = supabaseAdmin.from("orders").update(updates as never).select("id");
  if (opts.orderId) query = query.eq("id", opts.orderId);
  else if (opts.sessionId) query = query.eq("stripe_checkout_session_id", opts.sessionId);
  else if (opts.subscriptionId) query = query.eq("stripe_subscription_id", opts.subscriptionId);
  else return [];

  const { data } = await query;
  const ids = (data ?? []).map((row) => row.id as string);
  for (const id of ids) {
    await restoreHiddenProxiesForPaidOrder(id);
  }
  return ids;
}

async function markOrderPastDue(subscriptionId: string) {
  const graceUntil = new Date(Date.now() + 7 * 86400000).toISOString();
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .update({ status: "past_due", grace_until: graceUntil, last_payment_check_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscriptionId)
    .select("id");

  const ids = (orders ?? []).map((row) => row.id as string);
  if (ids.length > 0) {
    await supabaseAdmin
      .from("customer_proxies")
      .update({ status: "grace" as never })
      .in("order_id", ids)
      .eq("status", "active");
  }
}

async function markOrderCanceled(subscriptionId: string) {
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .update({ status: "cancelled" })
    .eq("stripe_subscription_id", subscriptionId)
    .select("id");

  for (const order of orders ?? []) {
    await hideOrReleaseProxiesForOrder(order.id as string);
  }
}

async function notifySale(orderId: string, via: string) {
  const { data: ord } = await supabaseAdmin
    .from("orders")
    .select("amount_cents, quantity, customer_email, billing_cycle, product_id, products(name, slug)")
    .eq("id", orderId)
    .maybeSingle();
  const prod = (ord as unknown as { products?: { name?: string; slug?: string } })?.products ?? null;
  const amount = ((ord?.amount_cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  await notifyAllAdmins({
    title: "💸 Nova venda",
    body: `${prod?.name ?? "Produto"} × ${ord?.quantity ?? 1} — ${amount} (${ord?.billing_cycle ?? "monthly"}) · ${ord?.customer_email ?? "cliente"}`,
    link: "/admin/orders",
    metadata: { orderId, productSlug: prod?.slug, via },
    dedupeKey: `sale:${orderId}`,
  });
}

async function allocateOrder(orderId: string) {
  try {
    const result = await allocateProxiesForOrder(orderId);
    await logAudit("allocate_proxies", result.short > 0 ? "partial" : "ok", { orderId, ...result }, result.error);
  } catch (err) {
    await logAudit("allocate_proxies", "error", { orderId }, err instanceof Error ? err.message : String(err));
  }
}

async function handleCheckoutSession(s: Stripe.Checkout.Session, eventType: string) {
  const orderId = (s.metadata?.order_id as string | undefined) ?? s.client_reference_id ?? undefined;
  const subscriptionId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
  const customerId = typeof s.customer === "string" ? s.customer : s.customer?.id;
  const customerEmail = (s.metadata?.customer_email as string | undefined) ?? s.customer_details?.email ?? s.customer_email ?? null;
  const customerName = (s.metadata?.customer_name as string | undefined) ?? s.customer_details?.name ?? null;

  if (eventType === "checkout.session.expired") {
    if (orderId) await supabaseAdmin.from("orders").update({ status: "expired" }).eq("id", orderId).eq("status", "pending");
    return;
  }
  if (s.payment_status !== "paid") return;

  if (orderId) await attachUserToOrder(orderId, customerEmail, customerName);

  let promoCode: string | null = null;
  try {
    const expanded = await getStripe().checkout.sessions.retrieve(s.id, {
      expand: ["total_details.breakdown.discounts.discount.promotion_code"],
    });
    const disc = expanded.total_details?.breakdown?.discounts?.[0]?.discount as Stripe.Discount | undefined;
    const pc = disc?.promotion_code;
    if (pc && typeof pc !== "string") promoCode = pc.code ?? null;
  } catch {
    /* ignore */
  }

  const periodEnd = await getSubscriptionPeriodEnd(subscriptionId);
  const paidOrderIds = await markOrderPaid({
    orderId,
    sessionId: s.id,
    subscriptionId,
    customerId,
    currentPeriodEnd: periodEnd,
    promoCode,
    discountCents: s.total_details?.amount_discount ?? 0,
  });

  // If this was an upsell (mensal → anual), flag the original order.
  const upsellFrom = (s.metadata?.upsell_from as string | undefined) ?? undefined;
  if (upsellFrom) {
    try {
      await supabaseAdmin
        .from("orders")
        .update({ upsell_taken: true } as never)
        .eq("id", upsellFrom);
    } catch {
      /* ignore */
    }
  }

  for (const id of paidOrderIds) {
    await allocateOrder(id);
    await notifySale(id, eventType);
    await sendPurchaseCapi(id, customerEmail, customerName);
  }
}


async function sendPurchaseCapi(
  orderId: string,
  email: string | null,
  name: string | null,
) {
  try {
    const { data: ord } = await supabaseAdmin
      .from("orders")
      .select("amount_cents, quantity, customer_email, customer_name, products(slug, name)")
      .eq("id", orderId)
      .maybeSingle();
    if (!ord) return;
    const prod = (ord as unknown as { products?: { slug?: string; name?: string } }).products ?? {};
    const { sendCapiEvent } = await import("@/lib/meta-capi.server");
    await sendCapiEvent({
      event_name: "Purchase",
      event_id: `purchase_${orderId}`,
      action_source: "website",
      event_source_url: "https://www.fastproxy.com.br/checkout/success",
      user_data: {
        email: email ?? ord.customer_email ?? null,
        name: name ?? ord.customer_name ?? null,
      },
      custom_data: {
        value: (ord.amount_cents ?? 0) / 100,
        currency: "BRL",
        content_ids: [prod.slug ?? "order"],
        content_name: prod.name,
        content_type: "product",
        contents: [
          {
            id: prod.slug ?? "order",
            quantity: ord.quantity ?? 1,
            item_price: (ord.amount_cents ?? 0) / Math.max(1, ord.quantity ?? 1) / 100,
          },
        ],
        num_items: ord.quantity ?? 1,
        order_id: orderId,
      },
    });
  } catch (err) {
    await logAudit("meta_capi_purchase", "error", { orderId }, err instanceof Error ? err.message : String(err));
  }
}

async function handlePaidInvoice(inv: Stripe.Invoice) {
  let subscriptionId = invoiceSubscriptionId(inv);
  if (!subscriptionId && inv.id) {
    try {
      const expanded = await getStripe().invoices.retrieve(inv.id, { expand: ["subscription"] });
      subscriptionId = invoiceSubscriptionId(expanded);
    } catch {
      /* ignore */
    }
  }
  if (!subscriptionId) return;

  const { data: before } = await supabaseAdmin
    .from("orders")
    .select("id, status, current_period_end, amount_cents, quantity, customer_email, billing_cycle, products(name, slug)")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  const periodEnd = invoicePeriodEnd(inv) ?? (await getSubscriptionPeriodEnd(subscriptionId));
  const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;
  const paidOrderIds = await markOrderPaid({
    subscriptionId,
    customerId,
    currentPeriodEnd: periodEnd,
    discountCents: inv.total_discount_amounts?.reduce((sum, d) => sum + (d.amount ?? 0), 0) ?? 0,
  });

  for (const id of paidOrderIds) await allocateOrder(id);

  const billingReason = (inv as unknown as { billing_reason?: string }).billing_reason;
  const oldEnd = before?.current_period_end ? new Date(before.current_period_end).getTime() : 0;
  const newEnd = periodEnd ? periodEnd * 1000 : 0;
  const isRenewal = billingReason === "subscription_cycle" || billingReason === "subscription_update" || (oldEnd > 0 && newEnd > oldEnd + 3600000);
  if (!isRenewal || !before?.id) return;

  const prod = (before as unknown as { products?: { name?: string; slug?: string } })?.products ?? null;
  const amountCents = inv.amount_paid ?? before.amount_cents ?? 0;
  const amount = (amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: (inv.currency ?? "brl").toUpperCase() });
  await notifyAllAdmins({
    title: "🔁 Renovação de plano",
    body: `${prod?.name ?? "Produto"} × ${before.quantity ?? 1} — ${amount} (${before.billing_cycle ?? "monthly"}) · ${before.customer_email ?? "cliente"}`,
    link: "/admin/orders",
    metadata: { invoiceId: inv.id, subscriptionId, orderId: before.id, productSlug: prod?.slug },
    dedupeKey: `renewal:${inv.id}`,
  });

  // Meta CAPI: count renewal as a Purchase (server-only, no Pixel pair)
  try {
    const { sendCapiEvent } = await import("@/lib/meta-capi.server");
    await sendCapiEvent({
      event_name: "Purchase",
      event_id: `renewal_${inv.id}`,
      action_source: "system_generated",
      user_data: { email: before.customer_email ?? null },
      custom_data: {
        value: amountCents / 100,
        currency: (inv.currency ?? "brl").toUpperCase(),
        content_ids: [prod?.slug ?? "order"],
        content_name: prod?.name,
        content_type: "product",
        contents: [{ id: prod?.slug ?? "order", quantity: before.quantity ?? 1, item_price: amountCents / Math.max(1, before.quantity ?? 1) / 100 }],
        num_items: before.quantity ?? 1,
        order_id: before.id,
        renewal: true,
      },
    });
  } catch (err) {
    await logAudit("meta_capi_renewal", "error", { invoiceId: inv.id }, err instanceof Error ? err.message : String(err));
  }


  try {
    const result = await renewProxyBlocksForOrder(before.id);
    if (result.renewed_proxies > 0) {
      await notifyAllAdmins({
        title: result.dry_run ? "🧪 Renovação simulada (dry-run)" : "🔁 Blocos renovados no provedor",
        body: `Pedido ${before.id.slice(0, 8)} — ${result.renewed_blocks} bloco(s) / ${result.renewed_proxies} IP(s) renovados · custo ≈ $${result.cost_usd.toFixed(2)}`,
        link: "/admin/inventory",
        metadata: { orderId: before.id, ...result },
        dedupeKey: `prolong:${inv.id}`,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await notifyAllAdmins({
      title: "🛑 Falha ao renovar blocos no provedor",
      body: `Pedido ${before.id.slice(0, 8)}: ${msg}`,
      link: "/admin/inventory",
      metadata: { orderId: before.id, error: msg },
      dedupeKey: `prolong-fail:${inv.id}`,
    });
  }
}

export async function handleStripeWebhook({ request }: { request: Request }) {
  const sig = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return new Response("missing signature", { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(body, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAudit("constructEvent", "error", { sig }, msg);
    return new Response(`invalid signature: ${msg}`, { status: 400 });
  }

  // Build a base event row that we always record, regardless of type
  const obj = event.data.object as unknown as Record<string, unknown>;
  const baseRow: EventRow = {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    occurred_at: new Date((event.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    raw: { type: event.type, data: event.data },
  };

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.expired": {
        const s = event.data.object as Stripe.Checkout.Session;
        baseRow.session_id = s.id;
        baseRow.customer_email = s.customer_details?.email ?? s.customer_email ?? null;
        baseRow.customer_id = typeof s.customer === "string" ? s.customer : s.customer?.id ?? null;
        baseRow.subscription_id = typeof s.subscription === "string" ? s.subscription : s.subscription?.id ?? null;
        baseRow.amount_cents = s.amount_total ?? null;
        baseRow.currency = s.currency ?? null;
        baseRow.status = s.payment_status ?? s.status ?? null;
        baseRow.order_id = (s.metadata?.order_id as string | undefined) ?? s.client_reference_id ?? null;
        await handleCheckoutSession(s, event.type);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const inv = event.data.object as Stripe.Invoice;
        baseRow.invoice_id = inv.id ?? null;
        baseRow.subscription_id = invoiceSubscriptionId(inv);
        baseRow.customer_id = typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;
        baseRow.customer_email = inv.customer_email ?? null;
        baseRow.amount_cents = inv.amount_paid ?? null;
        baseRow.currency = inv.currency ?? null;
        baseRow.status = inv.status ?? null;
        await handlePaidInvoice(inv);
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const subscriptionId = invoiceSubscriptionId(inv);
        baseRow.invoice_id = inv.id ?? null;
        baseRow.subscription_id = subscriptionId;
        baseRow.customer_email = inv.customer_email ?? null;
        baseRow.amount_cents = inv.amount_due ?? null;
        baseRow.currency = inv.currency ?? null;
        baseRow.status = "failed";
        if (subscriptionId) {
          await markOrderPastDue(subscriptionId);
          await notifyAllAdmins({
            title: "⚠️ Pagamento falhou — cliente em atraso",
            body: `A cobrança de ${inv.customer_email ?? "um cliente"} não foi aprovada (cartão recusado, saldo insuficiente ou 3DS não finalizado). O acesso continua por até 7 dias (período de graça). Depois disso os proxies são liberados.`,
            link: "/admin/inadimplentes",
            metadata: { invoiceId: inv.id, subscriptionId },
            dedupeKey: `payment-failed:${inv.id}`,
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        baseRow.subscription_id = sub.id;
        baseRow.customer_id = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
        baseRow.status = "canceled";
        await markOrderCanceled(sub.id);
        await notifyAllAdmins({
          title: "⛔ Assinatura encerrada",
          body: `A assinatura foi encerrada no Stripe e os proxies do cliente foram liberados. Motivo comum: cancelamento pelo cliente ou pagamento não recuperado após o período de graça.`,
          link: "/admin/cancelados",
          metadata: { subscriptionId: sub.id },
          dedupeKey: `subscription-canceled:${sub.id}`,
        });
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        baseRow.subscription_id = sub.id;
        baseRow.customer_id = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
        baseRow.status = sub.status;
        const cancelAt = (sub as unknown as { cancel_at_period_end?: boolean }).cancel_at_period_end;
        if (cancelAt) {
          baseRow.reason = "cancel_at_period_end";
          await notifyAllAdmins({
            title: "🟡 Cliente agendou cancelamento",
            body: `Um cliente marcou para cancelar no fim do período atual. Ele continua com os proxies até a data de renovação; depois disso, nada é cobrado.`,
            link: "/admin/cancelados",
            metadata: { subscriptionId: sub.id },
            dedupeKey: `subscription-cancel-scheduled:${sub.id}`,
          });
        }
        break;
      }
      case "customer.subscription.trial_will_end": {
        const sub = event.data.object as Stripe.Subscription;
        baseRow.subscription_id = sub.id;
        baseRow.status = "trial_ending";
        await notifyAllAdmins({
          title: "⏰ Período de teste acabando em 3 dias",
          body: `Um cliente em trial vai ser cobrado em breve. Se o cartão falhar, ele cai em inadimplência automática.`,
          link: "/admin/stripe",
          metadata: { subscriptionId: sub.id },
          dedupeKey: `trial-ending:${sub.id}`,
        });
        break;
      }
      case "charge.refunded": {
        const ch = event.data.object as Stripe.Charge;
        baseRow.charge_id = ch.id;
        baseRow.payment_intent_id = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id ?? null;
        baseRow.customer_email = ch.billing_details?.email ?? null;
        baseRow.customer_id = typeof ch.customer === "string" ? ch.customer : ch.customer?.id ?? null;
        baseRow.amount_cents = ch.amount_refunded ?? null;
        baseRow.currency = ch.currency ?? null;
        baseRow.status = "refunded";
        const amount = ((ch.amount_refunded ?? 0) / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: (ch.currency ?? "brl").toUpperCase(),
        });
        await notifyAllAdmins({
          title: "💸 Reembolso emitido",
          body: `${amount} reembolsado para ${ch.billing_details?.email ?? "cliente"}.`,
          link: "/admin/stripe",
          metadata: { chargeId: ch.id },
          dedupeKey: `refund:${ch.id}`,
        });
        break;
      }
      case "charge.dispute.created":
      case "charge.dispute.closed":
      case "charge.dispute.updated": {
        const d = event.data.object as Stripe.Dispute;
        baseRow.charge_id = typeof d.charge === "string" ? d.charge : d.charge?.id ?? null;
        baseRow.amount_cents = d.amount ?? null;
        baseRow.currency = d.currency ?? null;
        baseRow.status = d.status;
        baseRow.reason = d.reason ?? null;
        if (event.type === "charge.dispute.created") {
          const amount = ((d.amount ?? 0) / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: (d.currency ?? "brl").toUpperCase(),
          });
          await notifyAllAdmins({
            title: "🚨 Disputa/chargeback aberto",
            body: `${amount} contestado — motivo: ${d.reason ?? "desconhecido"}.`,
            link: "/admin/stripe",
            metadata: { disputeId: d.id, chargeId: baseRow.charge_id },
            dedupeKey: `dispute:${d.id}`,
          });
        }
        break;
      }
      case "payment_intent.succeeded":
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        baseRow.payment_intent_id = pi.id;
        baseRow.customer_id = typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null;
        baseRow.amount_cents = pi.amount ?? null;
        baseRow.currency = pi.currency ?? null;
        baseRow.status = pi.status;
        baseRow.customer_email = pi.receipt_email ?? null;
        break;
      }
      default:
        // Ainda gravamos o evento bruto para visibilidade no painel
        baseRow.customer_id = (obj.customer as string | undefined) ?? null;
        break;
    }

    await recordStripeEvent(baseRow);
    await logAudit(event.type, "ok", { id: event.id });
    return new Response("ok");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordStripeEvent({ ...baseRow, status: "error", reason: msg });
    await logAudit(event.type, "error", { id: event.id }, msg);
    return new Response(`handler error: ${msg}`, { status: 500 });
  }
}