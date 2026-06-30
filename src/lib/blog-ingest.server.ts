import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

/* ---------- Validation ---------- */

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const faqItem = z.object({
  question: z.string().min(3).max(300),
  answer: z.string().min(3).max(2000),
});

const postSchema = z.object({
  title: z.string().min(5).max(200),
  slug: z.string().min(3).max(160).regex(slugRe).optional(),
  excerpt: z.string().max(500).optional(),
  body_md: z.string().min(200).max(50_000),
  cover_image_url: z.string().url().max(2000).optional(),
  category_slug: z.string().max(160).regex(slugRe).optional(),
  tags: z.array(z.string().min(1).max(60)).max(10).default([]),
  seo_title: z.string().max(70).optional(),
  meta_description: z.string().max(180).optional(),
  keyword_primary: z.string().max(80).optional(),
  keywords_secondary: z.array(z.string().max(80)).max(20).default([]),
  faq: z.array(faqItem).max(15).default([]),
  status: z.enum(["draft", "scheduled"]).default("scheduled"),
  publish_at: z.string().datetime().optional(),
  source: z.string().min(1).max(80).default("external-agent"),
  display_author_name: z.string().min(1).max(80).optional(),
  noindex: z.boolean().optional(),
});

export const ingestPayloadSchema = z.object({
  posts: z.array(postSchema).min(1).max(20),
});

export type IngestPost = z.infer<typeof postSchema>;

/* ---------- HMAC ---------- */

function eqBuf(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyBearer(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const m = provided.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  return eqBuf(Buffer.from(m[1]), Buffer.from(expected));
}

export function verifySignature(
  rawBody: string,
  timestamp: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const sig = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  try {
    return eqBuf(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function timestampFresh(ts: string | null, skewSeconds = 300): boolean {
  if (!ts) return false;
  const n = Number(ts);
  if (!Number.isFinite(n)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - n) <= skewSeconds;
}

/* ---------- Markdown sanity ---------- */

const FORBIDDEN_RE = /(<script\b|<iframe\b|javascript:|on\w+\s*=)/i;

export function markdownLooksSafe(md: string): boolean {
  return !FORBIDDEN_RE.test(md);
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function readingMinutes(md: string): number {
  const words = md.replace(/[#*`_>\-]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/* ---------- Persistence ---------- */

export type IngestOutcome =
  | { action: "created" | "updated"; id: string; slug: string; status: string; publish_at: string | null; admin_url: string }
  | { action: "error"; slug: string | null; error: string };

async function getOrCreateTagIds(names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;
    const { data: existing } = await supabaseAdmin
      .from("post_tags")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const { data: ins } = await supabaseAdmin
      .from("post_tags")
      .insert({ slug, name })
      .select("id")
      .single();
    if (ins) ids.push(ins.id);
  }
  return ids;
}

async function resolveCategoryId(slug?: string): Promise<string | null> {
  if (!slug) return null;
  const { data } = await supabaseAdmin
    .from("post_categories")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return data?.id ?? null;
}

export async function persistIngestedPost(p: IngestPost): Promise<IngestOutcome> {
  try {
    if (!markdownLooksSafe(p.body_md)) {
      return { action: "error", slug: p.slug ?? null, error: "body_md contains forbidden tags" };
    }

    const slug = p.slug ?? slugify(p.title);
    if (!slugRe.test(slug)) {
      return { action: "error", slug, error: "invalid slug" };
    }

    // status + publish_at logic (min 1h in the future for scheduled)
    const minFuture = new Date(Date.now() + 60 * 60 * 1000);
    let autoPublishAt: Date | null = null;
    if (p.status === "scheduled") {
      const requested = p.publish_at ? new Date(p.publish_at) : minFuture;
      autoPublishAt = requested < minFuture ? minFuture : requested;
    }

    const category_id = await resolveCategoryId(p.category_slug);
    const tagIds = await getOrCreateTagIds(p.tags);

    const payload = {
      slug,
      title: p.title,
      excerpt: p.excerpt ?? null,
      content_md: p.body_md,
      cover_image_url: p.cover_image_url ?? null,
      status: "draft" as const, // always draft; cron promotes scheduled
      category_id,
      meta_title: p.seo_title ?? null,
      meta_description: p.meta_description ?? null,
      keyword_primary: p.keyword_primary ?? null,
      keywords_secondary: p.keywords_secondary,
      faq: p.faq,
      reading_time_minutes: readingMinutes(p.body_md),
      display_author_name: p.display_author_name ?? "FastProxy",
      noindex: p.noindex ?? false,
      source: p.source,
      auto_publish_at: autoPublishAt ? autoPublishAt.toISOString() : null,
    };

    // Idempotent by slug
    const { data: existing } = await supabaseAdmin
      .from("posts")
      .select("id, status")
      .eq("slug", slug)
      .maybeSingle();

    let id: string;
    let action: "created" | "updated";

    if (existing) {
      if (existing.status === "published") {
        return { action: "error", slug, error: "post already published; refusing to overwrite" };
      }
      const { error } = await supabaseAdmin.from("posts").update(payload).eq("id", existing.id);
      if (error) return { action: "error", slug, error: error.message };
      id = existing.id;
      action = "updated";
    } else {
      const { data: ins, error } = await supabaseAdmin
        .from("posts")
        .insert(payload)
        .select("id")
        .single();
      if (error || !ins) return { action: "error", slug, error: error?.message ?? "insert failed" };
      id = ins.id;
      action = "created";
    }

    // Sync tags
    await supabaseAdmin.from("post_tag_map").delete().eq("post_id", id);
    if (tagIds.length) {
      await supabaseAdmin
        .from("post_tag_map")
        .insert(tagIds.map((tag_id) => ({ post_id: id, tag_id })));
    }

    return {
      action,
      id,
      slug,
      status: autoPublishAt ? "scheduled" : "draft",
      publish_at: autoPublishAt ? autoPublishAt.toISOString() : null,
      admin_url: `/admin/blog/posts/${id}`,
    };
  } catch (e) {
    return { action: "error", slug: p.slug ?? null, error: e instanceof Error ? e.message : "unknown error" };
  }
}

/* ---------- Audit ---------- */

export async function auditIngest(params: {
  ip: string;
  source: string;
  status: "ok" | "rejected" | "partial";
  request: unknown;
  response: unknown;
}) {
  await supabaseAdmin.from("audit_log").insert({
    user_id: null,
    source: `system:blog-ingest:${params.source}`,
    action: "ingest",
    status: params.status,
    request: params.request as object,
    response: params.response as object,
  });
}
