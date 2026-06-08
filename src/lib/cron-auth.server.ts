// Shared auth helper for cron / hook endpoints under /api/public/*.
//
// Accepts either:
//   - CRON_SECRET (preferred custom shared secret, if set)
//   - SUPABASE_SERVICE_ROLE_KEY (high-privilege, never in pg_cron)
//   - SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY (public token — what
//     pg_cron actually carries via the `apikey` header)
//
// Constant-time compare. Returns null if authorised, or a 401/500 Response.
import { timingSafeEqual } from "crypto";

function safeEq(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function checkCronAuth(request: Request): Response | null {
  const provided =
    request.headers.get("x-cron-secret") ?? request.headers.get("apikey") ?? "";
  if (!provided) return new Response("Unauthorized", { status: 401 });

  const accepted: string[] = [
    process.env.CRON_SECRET ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
    process.env.SUPABASE_ANON_KEY ?? "",
  ].filter(Boolean);

  if (accepted.length === 0) {
    return new Response("Server misconfigured", { status: 500 });
  }

  for (const expected of accepted) {
    if (safeEq(provided, expected)) return null;
  }
  return new Response("Unauthorized", { status: 401 });
}
