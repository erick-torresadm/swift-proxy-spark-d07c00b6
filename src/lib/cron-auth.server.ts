// Shared auth helper for cron / hook endpoints under /api/public/*.
//
// Accepts ONLY high-entropy server-side secrets:
//   - CRON_SECRET (preferred; rotate via Lovable secrets)
//   - SUPABASE_SERVICE_ROLE_KEY (defensive fallback for admin-triggered calls)
//
// The Supabase publishable/anon key is NOT accepted: it ships in the public
// JS bundle, so anyone could trigger cron hooks with it.
//
// Header: prefer `x-cron-secret`. The `authorization: Bearer <secret>` and
// legacy `apikey` headers are also accepted so pg_cron jobs that already send
// an apikey header keep working as long as the value is CRON_SECRET (not the
// anon key).
import { timingSafeEqual } from "crypto";

function safeEq(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function checkCronAuth(request: Request): Response | null {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const provided =
    request.headers.get("x-cron-secret") ||
    bearer ||
    request.headers.get("apikey") ||
    "";
  if (!provided) return new Response("Unauthorized", { status: 401 });

  // Reject the publishable/anon key explicitly — even if a caller learns it.
  const publicKeys = [
    process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
    process.env.SUPABASE_ANON_KEY ?? "",
    FP_SUPABASE_PUBLISHABLE_KEY,
  ].filter(Boolean);
  for (const pub of publicKeys) {
    if (safeEq(provided, pub)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const accepted: string[] = [
    process.env.CRON_SECRET ?? "",
    process.env.FP_SUPABASE_SECRET_KEY ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  ].filter(Boolean);


  if (accepted.length === 0) {
    return new Response("Server misconfigured", { status: 500 });
  }

  for (const expected of accepted) {
    if (safeEq(provided, expected)) return null;
  }
  return new Response("Unauthorized", { status: 401 });
}
