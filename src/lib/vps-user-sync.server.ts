/**
 * Sincroniza o ciclo de vida do pedido IPv6 com a VPS (3proxy).
 *
 *   pago    → provisionOrder(orderId)    → cria usuário no 3proxy (ou reativa se já existe)
 *   grace/cancelado/expirado → blockOrder(orderId)  → remove do 3proxy (registro fica)
 *   pago após atraso → reactivateOrder(orderId)     → volta o acesso instantâneo
 *
 * Todo o fluxo é NO-OP enquanto `isVpsUserSyncEnabled()` retornar `false`
 * (flag em `provider_settings.dry_run` para provider='fastproxy_vps_users').
 * Assim conseguimos plugar no webhook do Stripe agora e só ligar quando o
 * HTTPS/domínio estiver pronto.
 */

import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import {
  isVpsUserSyncEnabled,
  vpsBaseUrlForClientFormat,
  vpsUsersBlock,
  vpsUsersCreate,
  vpsUsersReactivate,
} from "@/lib/fastproxy-users.server";

const PORT_START = 30000;
const PORT_END = 30499;

const IPV6_CATEGORIES = new Set(["ipv6", "ipv6_fb", "ipv6_rot"]);

type OrderRow = {
  id: string;
  user_id: string | null;
  status: string | null;
  customer_email: string | null;
  product_id: string | null;
  products?: { category?: string | null } | null;
};

type BindingRow = {
  id: string;
  order_id: string;
  username: string;
  password: string;
  block_id: string | null;
  status: string;
};

async function loadOrder(orderId: string): Promise<OrderRow | null> {
  const { data } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, status, customer_email, product_id, products(category)")
    .eq("id", orderId)
    .maybeSingle();
  return (data as OrderRow | null) ?? null;
}

async function loadBinding(orderId: string): Promise<BindingRow | null> {
  const { data } = await supabaseAdmin
    .from("vps_user_bindings")
    .select("id, order_id, username, password, block_id, status")
    .eq("order_id", orderId)
    .maybeSingle();
  return (data as BindingRow | null) ?? null;
}

function makeUsername(orderId: string) {
  // curto, previsível, sem hífens (3proxy costuma preferir isso)
  return `fp${orderId.replace(/-/g, "").slice(0, 12)}`;
}

function makePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function isIpv6Product(o: OrderRow | null): boolean {
  const cat = o?.products?.category ?? "";
  return IPV6_CATEGORIES.has(cat);
}

async function markBinding(id: string, patch: Record<string, unknown>) {
  await supabaseAdmin
    .from("vps_user_bindings")
    .update({ ...patch, last_synced_at: new Date().toISOString() })
    .eq("id", id);
}

/** Chame quando o pedido acabou de ser pago (invoice.paid / checkout.session.completed). */
export async function provisionOrderOnVps(orderId: string): Promise<{
  ok: boolean;
  skipped?: string;
  proxy?: string;
  error?: string;
}> {
  if (!(await isVpsUserSyncEnabled())) return { ok: true, skipped: "dry_run" };
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, error: "order not found" };
  if (!isIpv6Product(order)) return { ok: true, skipped: "not ipv6" };

  let binding = await loadBinding(orderId);

  // Caso 1: já existe binding → apenas reativa.
  if (binding) {
    try {
      await vpsUsersReactivate(binding.username);
      await markBinding(binding.id, { status: "active", last_error: null });
      return {
        ok: true,
        proxy: `socks5://${binding.username}:${binding.password}@${vpsBaseUrlForClientFormat()}:${PORT_START}-${PORT_END}`,
      };
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await markBinding(binding.id, { status: "error", last_error: err });
      return { ok: false, error: err };
    }
  }

  // Caso 2: cria usuário novo.
  const username = makeUsername(orderId);
  const password = makePassword();
  const block_id = `blk_${orderId.slice(0, 8)}`;

  try {
    await vpsUsersCreate({ username, password, block_id });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await supabaseAdmin.from("vps_user_bindings").insert({
      order_id: orderId,
      user_id: order.user_id,
      username,
      password,
      block_id,
      host: vpsBaseUrlForClientFormat(),
      port_start: PORT_START,
      port_end: PORT_END,
      status: "error",
      last_error: err,
      last_synced_at: new Date().toISOString(),
    });
    return { ok: false, error: err };
  }

  await supabaseAdmin.from("vps_user_bindings").insert({
    order_id: orderId,
    user_id: order.user_id,
    username,
    password,
    block_id,
    host: vpsBaseUrlForClientFormat(),
    port_start: PORT_START,
    port_end: PORT_END,
    status: "active",
    last_synced_at: new Date().toISOString(),
  });

  return {
    ok: true,
    proxy: `socks5://${username}:${password}@${vpsBaseUrlForClientFormat()}:${PORT_START}-${PORT_END}`,
  };
}

/** Chame quando a assinatura expirou/foi cancelada ou o grace terminou. */
export async function blockOrderOnVps(orderId: string): Promise<{
  ok: boolean;
  skipped?: string;
  error?: string;
}> {
  if (!(await isVpsUserSyncEnabled())) return { ok: true, skipped: "dry_run" };
  const binding = await loadBinding(orderId);
  if (!binding) return { ok: true, skipped: "no binding" };
  if (binding.status === "blocked") return { ok: true, skipped: "already blocked" };

  try {
    await vpsUsersBlock(binding.username);
    await markBinding(binding.id, { status: "blocked", last_error: null });
    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await markBinding(binding.id, { last_error: err });
    return { ok: false, error: err };
  }
}

/** Chame ao reativar cliente após pagamento em atraso. */
export async function reactivateOrderOnVps(orderId: string): Promise<{
  ok: boolean;
  skipped?: string;
  error?: string;
}> {
  if (!(await isVpsUserSyncEnabled())) return { ok: true, skipped: "dry_run" };
  const binding = await loadBinding(orderId);
  if (!binding) return { ok: true, skipped: "no binding" };
  if (binding.status === "active") return { ok: true, skipped: "already active" };

  try {
    await vpsUsersReactivate(binding.username);
    await markBinding(binding.id, { status: "active", last_error: null });
    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await markBinding(binding.id, { last_error: err });
    return { ok: false, error: err };
  }
}

/** Loop utilitário para o webhook: aceita várias ordens sem falhar o webhook. */
export async function safeProvisionMany(orderIds: string[]) {
  for (const id of orderIds) {
    try {
      await provisionOrderOnVps(id);
    } catch {
      /* isolado por pedido */
    }
  }
}

export async function safeBlockManyBySubscription(subscriptionId: string) {
  const { data } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("stripe_subscription_id", subscriptionId);
  for (const row of (data ?? []) as Array<{ id: string }>) {
    try {
      await blockOrderOnVps(row.id);
    } catch {
      /* ignore */
    }
  }
}
