/**
 * CORS com allowlist estrita — NUNCA refletir Origin arbitrário.
 * Usar apenas em rotas `/api/public/*` que precisam ser chamadas do browser
 * cross-origin (a maioria são webhooks server-to-server e não precisa disso).
 */

const ALLOWED_ORIGINS = new Set([
  "https://fastproxy.com.br",
  "https://www.fastproxy.com.br",
  "https://swift-proxy-spark.lovable.app",
  "http://localhost:8080",
  "http://localhost:3000",
]);

const ALLOWED_SUFFIXES = [".lovable.app", ".lovable.dev"];

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return ALLOWED_SUFFIXES.some((s) => url.hostname.endsWith(s));
  } catch {
    return false;
  }
}

export function corsHeadersFor(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!isOriginAllowed(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin as string,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

export function withCors(request: Request, response: Response): Response {
  const cors = corsHeadersFor(request);
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
