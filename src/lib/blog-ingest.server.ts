import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

/* ---------- Validation ---------- */

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const faqItem = z.object({
  question: z.string().min(3).max(500),
  answer: z.string().min(3).max(3000),
});

const postSchema = z.object({
  title: z.string().min(3).max(120),
  slug: z.string().min(3).max(160).regex(slugRe),
  content_md: z.string().min(200).max(80_000),
  meta_title: z.string().max(70).optional(),
  meta_description: z.string().max(200).optional(),
  excerpt: z.string().max(300).optional(),
  keyword_primary: z.string().max(255).optional(),
  keywords_secondary: z.array(z.string().max(120)).max(30).optional(),
  cover_image_url: z.string().max(500).optional(),
  category_id: z.string().regex(uuidRe).optional(),
  published_at: z.string().datetime().optional(),
  display_author_name: z.string().max(100).default("Equipe FastProxy"),
  reading_time_minutes: z.number().int().positive().max(240).optional(),
  faq: z.array(faqItem).max(20).optional(),
  canonical_url: z.string().max(500).optional(),
  noindex: z.boolean().default(false),
  auto_publish_at: z.string().datetime().optional(),
  source: z.string().max(50).default("ai-generated"),
  tags: z.array(z.string().min(1).max(60)).max(15).optional(),
  status: z.enum(["draft", "published", "scheduled"]).default("draft"),
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

function computeReadingMinutes(md: string): number {
  const words = md.replace(/[#*`_>\-]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 230));
}

/* ---------- Persistence ---------- */

export type IngestOutcome =
  | {
      action: "created" | "updated";
      id: string;
      slug: string;
      status: string;
      published_at: string | null;
      auto_publish_at: string | null;
      admin_url: string;
    }
  | { action: "error"; slug: string | null; error: string };

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

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

export async function persistIngestedPost(p: IngestPost): Promise<IngestOutcome> {
  try {
    if (!markdownLooksSafe(p.content_md)) {
      return { action: "error", slug: p.slug, error: "content_md contains forbidden tags" };
    }

    const status = p.status;
    const publishedAt =
      status === "published"
        ? (p.published_at ?? new Date().toISOString())
        : (p.published_at ?? null);
    const autoPublishAt = status === "scheduled" ? (p.auto_publish_at ?? p.published_at ?? null) : null;

    const payload = {
      slug: p.slug,
      title: p.title,
      content_md: p.content_md,
      excerpt: p.excerpt ?? null,
      meta_title: p.meta_title ?? null,
      meta_description: p.meta_description ?? null,
      keyword_primary: p.keyword_primary ?? null,
      keywords_secondary: p.keywords_secondary ?? [],
      cover_image_url: p.cover_image_url ?? null,
      category_id: p.category_id ?? null,
      published_at: publishedAt,
      display_author_name: p.display_author_name,
      reading_time_minutes: p.reading_time_minutes ?? computeReadingMinutes(p.content_md),
      faq: (p.faq ?? []) as never,
      canonical_url: p.canonical_url ?? null,
      noindex: p.noindex,
      auto_publish_at: autoPublishAt,
      source: p.source,
      status,
    };

    const { data: existing } = await supabaseAdmin
      .from("posts")
      .select("id")
      .eq("slug", p.slug)
      .maybeSingle();

    let id: string;
    let action: "created" | "updated";

    if (existing) {
      const { error } = await supabaseAdmin.from("posts").update(payload).eq("id", existing.id);
      if (error) return { action: "error", slug: p.slug, error: error.message };
      id = existing.id;
      action = "updated";
    } else {
      const { data: ins, error } = await supabaseAdmin
        .from("posts")
        .insert(payload)
        .select("id")
        .single();
      if (error || !ins) return { action: "error", slug: p.slug, error: error?.message ?? "insert failed" };
      id = ins.id;
      action = "created";
    }

    // Sync tags
    if (p.tags) {
      const tagIds = await getOrCreateTagIds(p.tags);
      await supabaseAdmin.from("post_tag_map").delete().eq("post_id", id);
      if (tagIds.length) {
        await supabaseAdmin
          .from("post_tag_map")
          .insert(tagIds.map((tag_id) => ({ post_id: id, tag_id })));
      }
    }

    return {
      action,
      id,
      slug: p.slug,
      status,
      published_at: publishedAt,
      auto_publish_at: autoPublishAt,
      admin_url: `/admin/blog/${id}`,
    };
  } catch (e) {
    return { action: "error", slug: p.slug, error: e instanceof Error ? e.message : "unknown error" };
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
    request: params.request as never,
    response: params.response as never,
  });
}
