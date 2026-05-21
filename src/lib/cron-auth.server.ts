// Shared auth helper for cron / hook endpoints under /api/public/*.
// Validates the `apikey` (or `x-cron-secret`) header against the
// SUPABASE_SERVICE_ROLE_KEY using a constant-time compare. The service-role
// key is server-only and is never bundled into the client, so it is safe to
// use as a shared secret between pg_cron / external schedulers and these
// endpoints.
import { timingSafeEqual } from "crypto";

export function checkCronAuth(request: Request): Response | null {
  const expected =
    process.env.CRON_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const provided =
    request.headers.get("x-cron-secret") ?? request.headers.get("apikey") ?? "";

  if (!expected) return new Response("Server misconfigured", { status: 500 });

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
