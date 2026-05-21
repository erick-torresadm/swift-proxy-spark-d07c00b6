import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const slugSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9-]+$/, "Use apenas minúsculas, números e hífen");

const faqSchema = z.array(
  z.object({
    question: z.string().min(1).max(300),
    answer: z.string().min(1).max(2000),
  }),
);

async function getRoles(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  return (data ?? []).map((r) => r.role as string);
}

async function assertAdmin(userId: string) {
  const roles = await getRoles(userId);
  if (!roles.includes("admin")) throw new Error("Acesso negado: apenas admin");
}

async function assertBlogEditor(userId: string) {
  const roles = await getRoles(userId);
  if (!roles.some((r) => r === "admin" || r === "editor")) {
    throw new Error("Acesso negado: precisa ser admin ou editor");
  }
}

async function assertCommentMod(userId: string) {
  const roles = await getRoles(userId);
  if (!roles.some((r) => r === "admin" || r === "editor" || r === "moderator")) {
    throw new Error("Acesso negado: precisa moderar comentários");
  }
}

function estimateReadingMinutes(md: string): number {
  const words = md.replace(/[#*`_>\-]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/* ---------------- PÚBLICO ---------------- */

export const listPublishedPosts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        page: z.number().int().min(1).max(500).default(1),
        pageSize: z.number().int().min(1).max(50).default(12),
        categorySlug: z.string().optional(),
        tagSlug: z.string().optional(),
        search: z.string().max(120).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = supabaseAdmin
      .from("posts")
      .select(
        "id, slug, title, excerpt, cover_image_url, published_at, reading_time_minutes, view_count, post_categories(slug, name)",
        { count: "exact" },
      )
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false })
      .range(from, to);

    if (data.categorySlug) {
      const { data: cat } = await supabaseAdmin
        .from("post_categories")
        .select("id")
        .eq("slug", data.categorySlug)
        .maybeSingle();
      if (cat) q = q.eq("category_id", cat.id);
    }
    if (data.search) {
      q = q.ilike("title", `%${data.search}%`);
    }
    if (data.tagSlug) {
      const { data: tag } = await supabaseAdmin
        .from("post_tags")
        .select("id")
        .eq("slug", data.tagSlug)
        .maybeSingle();
      if (tag) {
        const { data: mapping } = await supabaseAdmin
          .from("post_tag_map")
          .select("post_id")
          .eq("tag_id", tag.id);
        const ids = (mapping ?? []).map((m) => m.post_id);
        if (ids.length === 0) return { posts: [], total: 0 };
        q = q.in("id", ids);
      }
    }

    const { data: rows, count } = await q;
    return {
      posts: (rows ?? []).map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        excerpt: r.excerpt,
        cover_image_url: r.cover_image_url,
        published_at: r.published_at,
        reading_time_minutes: r.reading_time_minutes,
        view_count: r.view_count,
        category: r.post_categories
          ? { slug: r.post_categories.slug, name: r.post_categories.name }
          : null,
      })),
      total: count ?? 0,
    };
  });

export const getPostBySlug = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ slug: z.string().min(1).max(160) }).parse(d),
  )
  .handler(async ({ data }) => {
    // Try post first
    const { data: post } = await supabaseAdmin
      .from("posts")
      .select(
        "id, slug, title, excerpt, content_md, cover_image_url, status, published_at, meta_title, meta_description, keyword_primary, keywords_secondary, faq, reading_time_minutes, view_count, post_categories(slug, name), post_tag_map(post_tags(slug, name))",
      )
      .eq("slug", data.slug)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .maybeSingle();

    if (post) {
      // increment view count async (best-effort)
      supabaseAdmin
        .from("posts")
        .update({ view_count: (post.view_count ?? 0) + 1 })
        .eq("id", post.id)
        .then(() => {});
      return {
        kind: "post" as const,
        id: post.id,
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        content_md: post.content_md,
        cover_image_url: post.cover_image_url,
        published_at: post.published_at,
        meta_title: post.meta_title,
        meta_description: post.meta_description,
        keyword_primary: post.keyword_primary,
        keywords_secondary: post.keywords_secondary ?? [],
        faq: (post.faq as Array<{ question: string; answer: string }>) ?? [],
        reading_time_minutes: post.reading_time_minutes,
        category: post.post_categories
          ? { slug: post.post_categories.slug, name: post.post_categories.name }
          : null,
        tags: (post.post_tag_map ?? [])
          .map((m: { post_tags: { slug: string; name: string } | null }) => m.post_tags)
          .filter(Boolean) as { slug: string; name: string }[],
      };
    }

    // Programmatic
    const { data: prog } = await supabaseAdmin
      .from("programmatic_pages")
      .select("*")
      .eq("slug", data.slug)
      .eq("active", true)
      .maybeSingle();
    if (prog) {
      supabaseAdmin
        .from("programmatic_pages")
        .update({ view_count: (prog.view_count ?? 0) + 1 })
        .eq("id", prog.id)
        .then(() => {});
      return {
        kind: "programmatic" as const,
        id: prog.id,
        slug: prog.slug,
        title: prog.title,
        excerpt: prog.excerpt,
        content_md: prog.content_md,
        cover_image_url: null,
        published_at: prog.created_at,
        meta_title: prog.meta_title,
        meta_description: prog.meta_description,
        keyword_primary: prog.keyword_primary,
        keywords_secondary: prog.keywords_secondary ?? [],
        faq: [],
        reading_time_minutes: 3,
        category: null,
        tags: [] as { slug: string; name: string }[],
      };
    }
    return null;
  });

export const listCategories = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("post_categories")
    .select("slug, name, description")
    .order("name");
  return data ?? [];
});

export const listRelatedPosts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ postId: z.string().uuid(), limit: z.number().min(1).max(10).default(3) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: src } = await supabaseAdmin
      .from("posts")
      .select("category_id")
      .eq("id", data.postId)
      .maybeSingle();
    if (!src?.category_id) return [];
    const { data: related } = await supabaseAdmin
      .from("posts")
      .select("slug, title, excerpt, cover_image_url, published_at")
      .eq("status", "published")
      .eq("category_id", src.category_id)
      .neq("id", data.postId)
      .order("published_at", { ascending: false })
      .limit(data.limit);
    return related ?? [];
  });

/* ---------------- COMENTÁRIOS ---------------- */

export const listComments = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ postId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: rows } = await supabaseAdmin
      .from("post_comments")
      .select("id, body, parent_id, user_id, created_at, status")
      .eq("post_id", data.postId)
      .eq("status", "visible")
      .order("created_at", { ascending: true })
      .limit(500);

    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const { data: profiles } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", userIds)
      : { data: [] as Array<{ user_id: string; full_name: string | null; avatar_url: string | null }> };
    const profMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    return (rows ?? []).map((r) => ({
      id: r.id,
      body: r.body,
      parent_id: r.parent_id,
      created_at: r.created_at,
      author_name: profMap.get(r.user_id)?.full_name ?? "Cliente",
      author_avatar: profMap.get(r.user_id)?.avatar_url ?? null,
    }));
  });

export const createComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        postId: z.string().uuid(),
        parentId: z.string().uuid().optional(),
        body: z.string().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Rate limit: max 5 comments per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count } = await supabaseAdmin
      .from("post_comments")
      .select("*", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gte("created_at", oneHourAgo);
    if ((count ?? 0) >= 5) {
      throw new Error("Limite de 5 comentários por hora atingido. Aguarde.");
    }

    // Sanitize: strip script-ish stuff (sanitization also done on render)
    const cleanBody = data.body.replace(/<\/?[^>]+(>|$)/g, "").trim();
    if (!cleanBody) throw new Error("Comentário vazio");

    const { data: inserted, error } = await supabaseAdmin
      .from("post_comments")
      .insert({
        post_id: data.postId,
        user_id: context.userId,
        parent_id: data.parentId ?? null,
        body: cleanBody,
        status: "visible",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Push notification to parent author if reply
    if (data.parentId) {
      const { data: parent } = await supabaseAdmin
        .from("post_comments")
        .select("user_id, post_id, posts(title, slug)")
        .eq("id", data.parentId)
        .maybeSingle();
      if (parent && parent.user_id !== context.userId) {
        const { enqueueNotification } = await import("./notifications.server");
        await enqueueNotification({
          userId: parent.user_id,
          kind: "system",
          title: "Alguém respondeu seu comentário 💬",
          body: cleanBody.slice(0, 120),
          link: `/blog/${parent.posts?.slug ?? ""}#comments`,
          dedupeKey: `comment-reply-${inserted.id}`,
          sendImmediately: true,
        });
      }
    }
    return { id: inserted.id };
  });

export const moderateComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["hide", "show", "delete"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCommentMod(context.userId);
    if (data.action === "delete") {
      await supabaseAdmin.from("post_comments").delete().eq("id", data.id);
    } else {
      await supabaseAdmin
        .from("post_comments")
        .update({ status: data.action === "hide" ? "hidden" : "visible" })
        .eq("id", data.id);
    }
    return { ok: true };
  });

export const listAllComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCommentMod(context.userId);
    const { data: rows } = await supabaseAdmin
      .from("post_comments")
      .select("id, body, status, created_at, user_id, post_id, posts(slug, title)")
      .order("created_at", { ascending: false })
      .limit(200);
    return rows ?? [];
  });

/* ---------------- ADMIN ---------------- */

const postUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  slug: slugSchema,
  title: z.string().min(1).max(200),
  excerpt: z.string().max(500).optional().nullable(),
  content_md: z.string().max(100_000).default(""),
  cover_image_url: z.string().url().max(2000).optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  category_id: z.string().uuid().optional().nullable(),
  published_at: z.string().optional().nullable(),
  meta_title: z.string().max(70).optional().nullable(),
  meta_description: z.string().max(180).optional().nullable(),
  keyword_primary: z.string().max(80).optional().nullable(),
  keywords_secondary: z.array(z.string().max(80)).max(20).default([]),
  faq: faqSchema.default([]),
  tag_ids: z.array(z.string().uuid()).max(20).default([]),
});

export const upsertPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => postUpsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertBlogEditor(context.userId);
    const payload = {
      slug: data.slug,
      title: data.title,
      excerpt: data.excerpt ?? null,
      content_md: data.content_md,
      cover_image_url: data.cover_image_url ?? null,
      status: data.status,
      category_id: data.category_id ?? null,
      author_id: context.userId,
      published_at:
        data.status === "published"
          ? data.published_at ?? new Date().toISOString()
          : data.published_at ?? null,
      meta_title: data.meta_title ?? null,
      meta_description: data.meta_description ?? null,
      keyword_primary: data.keyword_primary ?? null,
      keywords_secondary: data.keywords_secondary,
      faq: data.faq,
      reading_time_minutes: estimateReadingMinutes(data.content_md),
    };
    let postId = data.id;
    if (postId) {
      const { error } = await supabaseAdmin.from("posts").update(payload).eq("id", postId);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await supabaseAdmin
        .from("posts")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      postId = ins.id;
    }
    // Sync tags
    await supabaseAdmin.from("post_tag_map").delete().eq("post_id", postId);
    if (data.tag_ids.length) {
      await supabaseAdmin
        .from("post_tag_map")
        .insert(data.tag_ids.map((tag_id) => ({ post_id: postId!, tag_id })));
    }
    return { id: postId };
  });

export const listAllPostsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertBlogEditor(context.userId);
    const { data } = await supabaseAdmin
      .from("posts")
      .select("id, slug, title, status, published_at, view_count, post_categories(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    return (data ?? []).map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status,
      published_at: p.published_at,
      view_count: p.view_count,
      category_name: p.post_categories?.name ?? null,
    }));
  });

export const getPostAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBlogEditor(context.userId);
    const { data: post } = await supabaseAdmin
      .from("posts")
      .select("*, post_tag_map(tag_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (!post) throw new Error("Post não encontrado");
    return {
      ...post,
      tag_ids: (post.post_tag_map ?? []).map(
        (m: { tag_id: string }) => m.tag_id,
      ),
    };
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBlogEditor(context.userId);
    await supabaseAdmin.from("posts").delete().eq("id", data.id);
    return { ok: true };
  });

/* Categorias + tags */

export const upsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        slug: slugSchema,
        name: z.string().min(1).max(80),
        description: z.string().max(500).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertBlogEditor(context.userId);
    if (data.id) {
      await supabaseAdmin
        .from("post_categories")
        .update({ slug: data.slug, name: data.name, description: data.description ?? null })
        .eq("id", data.id);
    } else {
      await supabaseAdmin
        .from("post_categories")
        .insert({ slug: data.slug, name: data.name, description: data.description ?? null });
    }
    return { ok: true };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBlogEditor(context.userId);
    await supabaseAdmin.from("post_categories").delete().eq("id", data.id);
    return { ok: true };
  });

export const listTags = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("post_tags")
    .select("id, slug, name")
    .order("name");
  return data ?? [];
});

export const upsertTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        slug: slugSchema,
        name: z.string().min(1).max(80),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertBlogEditor(context.userId);
    if (data.id) {
      await supabaseAdmin
        .from("post_tags")
        .update({ slug: data.slug, name: data.name })
        .eq("id", data.id);
    } else {
      await supabaseAdmin.from("post_tags").insert({ slug: data.slug, name: data.name });
    }
    return { ok: true };
  });

export const deleteTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBlogEditor(context.userId);
    await supabaseAdmin.from("post_tags").delete().eq("id", data.id);
    return { ok: true };
  });

/* Programmatic pages */

export const listProgrammaticAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertBlogEditor(context.userId);
    const { data } = await supabaseAdmin
      .from("programmatic_pages")
      .select("id, slug, title, group_name, active, view_count, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    return data ?? [];
  });

export const generateProgrammaticBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        group_name: z.string().min(1).max(80),
        title_template: z.string().min(1).max(200),
        excerpt_template: z.string().max(500).optional(),
        slug_template: z.string().min(1).max(160),
        meta_description_template: z.string().max(180).optional(),
        keyword_template: z.string().max(80).optional(),
        content_template: z.string().min(10).max(100_000),
        items: z
          .array(z.record(z.string(), z.string().max(200)))
          .min(1)
          .max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertBlogEditor(context.userId);
    const fill = (tpl: string, vars: Record<string, string>) =>
      tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
    const rows = data.items.map((vars) => ({
      slug: fill(data.slug_template, vars).toLowerCase(),
      title: fill(data.title_template, vars),
      excerpt: data.excerpt_template ? fill(data.excerpt_template, vars) : null,
      content_md: fill(data.content_template, vars),
      meta_description: data.meta_description_template
        ? fill(data.meta_description_template, vars)
        : null,
      keyword_primary: data.keyword_template ? fill(data.keyword_template, vars) : null,
      variables: vars,
      group_name: data.group_name,
      active: true,
    }));
    const { error, data: ins } = await supabaseAdmin
      .from("programmatic_pages")
      .upsert(rows, { onConflict: "slug" })
      .select("id");
    if (error) throw new Error(error.message);
    return { inserted: ins?.length ?? 0 };
  });

export const toggleProgrammatic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertBlogEditor(context.userId);
    await supabaseAdmin
      .from("programmatic_pages")
      .update({ active: data.active })
      .eq("id", data.id);
    return { ok: true };
  });

export const deleteProgrammatic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBlogEditor(context.userId);
    await supabaseAdmin.from("programmatic_pages").delete().eq("id", data.id);
    return { ok: true };
  });
