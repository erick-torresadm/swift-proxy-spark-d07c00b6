import { createFileRoute } from "@tanstack/react-router";
import {
  ingestPayloadSchema,
  verifyBearer,
  verifySignature,
  timestampFresh,
  persistIngestedPost,
  auditIngest,
} from "@/lib/blog-ingest.server";

const MAX_BODY_BYTES = 500 * 1024; // 500 KB

function deny(status: number, msg: string): Response {
  // Generic messages so attackers can't distinguish layers
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export const Route = createFileRoute("/api/public/blog/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.BLOG_INGEST_TOKEN;
        const hmacSecret = process.env.BLOG_INGEST_HMAC_SECRET;
        if (!token || !hmacSecret) {
          return deny(503, "ingest disabled");
        }

        // Optional IP allowlist
        const allowed = (process.env.BLOG_INGEST_ALLOWED_IPS || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const ip = getClientIp(request);
        if (allowed.length && !allowed.includes(ip)) {
          return deny(403, "forbidden");
        }

        // Bearer
        if (!verifyBearer(request.headers.get("authorization"), token)) {
          return deny(401, "unauthorized");
        }

        // Timestamp freshness (±5 min)
        const ts = request.headers.get("x-timestamp");
        if (!timestampFresh(ts, 300)) {
          return deny(401, "unauthorized");
        }

        // Read raw body (size-limited)
        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) {
          return deny(413, "payload too large");
        }

        // HMAC
        if (!verifySignature(raw, ts!, request.headers.get("x-signature"), hmacSecret)) {
          return deny(401, "unauthorized");
        }

        // Nonce anti-replay
        const nonce = request.headers.get("x-nonce");
        if (!nonce || nonce.length < 8 || nonce.length > 128) {
          return deny(401, "unauthorized");
        }
        const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
        const { error: nonceErr } = await supabaseAdmin
          .from("blog_ingest_nonces")
          .insert({ nonce });
        if (nonceErr) {
          // duplicate key => replay
          return deny(409, "replay");
        }

        // Rate limit (30 req / 10 min per IP)
        const { data: rate } = await supabaseAdmin.rpc("bump_blog_ingest_rate", {
          _ip: ip,
          _window_minutes: 10,
        });
        if (typeof rate === "number" && rate > 30) {
          return deny(429, "rate limit");
        }

        // Parse body
        let parsed;
        try {
          const json = JSON.parse(raw);
          parsed = ingestPayloadSchema.parse(json);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "invalid body";
          await auditIngest({
            ip,
            source: "unknown",
            status: "rejected",
            request: { rawSize: raw.length },
            response: { error: msg.slice(0, 500) },
          });
          return deny(400, "invalid body");
        }

        // Persist
        const created: unknown[] = [];
        const updated: unknown[] = [];
        const errors: unknown[] = [];
        for (const p of parsed.posts) {
          const r = await persistIngestedPost(p);
          if (r.action === "created") created.push(r);
          else if (r.action === "updated") updated.push(r);
          else errors.push(r);
        }

        const sourceTag = parsed.posts[0]?.source ?? "external-agent";
        await auditIngest({
          ip,
          source: sourceTag,
          status: errors.length === 0 ? "ok" : created.length + updated.length === 0 ? "rejected" : "partial",
          request: { posts: parsed.posts.length },
          response: { created: created.length, updated: updated.length, errors: errors.length },
        });

        return new Response(
          JSON.stringify({ ok: errors.length === 0, created, updated, errors }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
