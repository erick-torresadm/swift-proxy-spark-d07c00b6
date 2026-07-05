/**
 * Rate limiter usando a tabela `rate_limit_hits` + função `bump_rate_hit`.
 * Só roda no servidor (usa supabaseAdmin).
 */
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfter: number;
}

/**
 * Registra uma tentativa no bucket/key e retorna se está dentro do limite.
 * Nunca deve derrubar o request se o Postgres estiver fora — fail-open com log.
 */
export async function bumpRateLimit(
  bucket: string,
  key: string,
  windowSeconds: number,
  limit: number,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc("bump_rate_hit", {
      _bucket: bucket,
      _key: key,
      _window_seconds: windowSeconds,
      _limit: limit,
    });
    if (error) {
      console.warn("[rate-limit] rpc error, fail-open:", error.message);
      return { allowed: true, count: 0, retryAfter: 0 };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: row?.allowed ?? true,
      count: row?.count ?? 0,
      retryAfter: row?.retry_after ?? 0,
    };
  } catch (e) {
    console.warn("[rate-limit] exception, fail-open:", e);
    return { allowed: true, count: 0, retryAfter: 0 };
  }
}

/** Pega o IP do request (respeitando X-Forwarded-For). */
export function currentIp(): string {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? "unknown";
  } catch {
    const xff = getRequestHeader("x-forwarded-for");
    return xff?.split(",")[0]?.trim() ?? "unknown";
  }
}

/**
 * Helper: aplica rate limit e lança erro amigável se estourar.
 * Uso em createServerFn handler:
 *   await enforceRateLimit("chat.send", context.userId, 60, 30);
 */
export async function enforceRateLimit(
  bucket: string,
  key: string,
  windowSeconds: number,
  limit: number,
): Promise<void> {
  const res = await bumpRateLimit(bucket, key, windowSeconds, limit);
  if (!res.allowed) {
    const err = new Error(
      `Muitas tentativas. Tente novamente em ${res.retryAfter}s.`,
    );
    (err as Error & { status?: number; retryAfter?: number }).status = 429;
    (err as Error & { status?: number; retryAfter?: number }).retryAfter = res.retryAfter;
    throw err;
  }
}
