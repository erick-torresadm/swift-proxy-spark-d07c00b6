/**
 * ProxySeller API client (server-only).
 * Docs: https://docs.proxy-seller.com/
 *
 * Base URL: https://proxy-seller.com/personal/api/v1/{apiKey}/
 * Auth: API key in URL path.
 * Note: business errors return HTTP 200 with `errors[]` populated.
 *
 * IMPORTANT: never expose this to the client. Server-only.
 */

const BASE = "https://proxy-seller.com/personal/api/v1";

function getApiKey(): string {
  const key = process.env.PROXYSELLER_API_KEY;
  if (!key) throw new Error("PROXYSELLER_API_KEY not configured");
  return key;
}

type PsResponse<T> = {
  status: "success" | "error";
  data: T | null;
  errors: Array<{ message: string; code: number; customData: unknown }>;
};

async function psPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = `${BASE}/${getApiKey()}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as PsResponse<T>;
  if (json.status !== "success" || !json.data) {
    const msg = json.errors?.[0]?.message ?? `ProxySeller ${path} failed`;
    throw new Error(`ProxySeller: ${msg}`);
  }
  return json.data;
}

async function psGet<T>(path: string): Promise<T> {
  const url = `${BASE}/${getApiKey()}${path}`;
  const res = await fetch(url, { method: "GET" });
  const json = (await res.json()) as PsResponse<T>;
  if (json.status !== "success" || !json.data) {
    const msg = json.errors?.[0]?.message ?? `ProxySeller ${path} failed`;
    throw new Error(`ProxySeller: ${msg}`);
  }
  return json.data;
}

export type PsProxyItem = {
  id: string;
  order_id: string;
  order_number: string;
  ip: string;
  ip_only: string;
  protocol: string;
  port_socks: number;
  port_http: number;
  login: string;
  password: string;
  country: string;
  country_alpha3: string;
  date_end: string; // dd.mm.yyyy
};

type PsOrderMakeData = {
  orderId: number;
  total: number;
  listBaseOrderNumbers: string[];
  balance: number;
};

/**
 * Buys an IPv6 block from ProxySeller and returns the provisioned proxies.
 * - countryId/periodId come from /reference/list/ipv6
 * - paymentId=1 → uses account balance
 */
export async function purchaseIpv6Block(params: {
  countryId: number;
  periodId: string;
  quantity: number;
}): Promise<{
  externalOrderId: string;
  baseOrderNumber: string;
  costCents: number;
  proxies: PsProxyItem[];
}> {
  const order = await psPost<PsOrderMakeData>("/order/make/ipv6", {
    countryId: params.countryId,
    periodId: params.periodId,
    quantity: params.quantity,
    paymentId: 1,
    authorization: "",
  });

  const baseOrderNumber = order.listBaseOrderNumbers?.[0];
  if (!baseOrderNumber) throw new Error("ProxySeller: no baseOrderNumber returned");

  // Fetch the actual IPs provisioned for this order
  const list = await psGet<{ items: PsProxyItem[] }>(
    `/proxy/list/ipv6?orderId=${encodeURIComponent(baseOrderNumber)}`,
  );

  return {
    externalOrderId: String(order.orderId),
    baseOrderNumber,
    costCents: Math.round((order.total ?? 0) * 100),
    proxies: list.items ?? [],
  };
}

/**
 * Rotates / replaces a single proxy IP at the provider.
 * The proxy slot stays (same order), only the IP changes.
 * Returns the new proxy details to refresh local stock.
 */
export async function replaceProxyIp(externalProxyId: string): Promise<PsProxyItem | null> {
  const data = await psPost<{ items?: PsProxyItem[] }>("/proxy/replace", {
    ids: [externalProxyId],
  });
  return data.items?.[0] ?? null;
}

/** Parse dd.mm.yyyy → ISO date */
export function psDateToIso(d: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(d);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00Z`;
}
