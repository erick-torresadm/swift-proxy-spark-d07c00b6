import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BASE_URL = "https://swift-proxy-spark.lovable.app";

interface Entry {
  path: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const staticEntries: Entry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/blog", changefreq: "daily", priority: "0.9" },
          { path: "/login", changefreq: "monthly", priority: "0.3" },
          { path: "/signup", changefreq: "monthly", priority: "0.3" },
          { path: "/privacidade", changefreq: "yearly", priority: "0.4" },
          { path: "/termos", changefreq: "yearly", priority: "0.4" },
          { path: "/reembolso", changefreq: "yearly", priority: "0.4" },
        ];

        const [{ data: posts }, { data: cats }, { data: prog }] = await Promise.all([
          supabaseAdmin
            .from("posts")
            .select("slug, updated_at")
            .eq("status", "published")
            .lte("published_at", new Date().toISOString())
            .limit(5000),
          supabaseAdmin.from("post_categories").select("slug").limit(500),
          supabaseAdmin
            .from("programmatic_pages")
            .select("slug, updated_at")
            .eq("active", true)
            .limit(5000),
        ]);

        const entries: Entry[] = [
          ...staticEntries,
          ...(posts ?? []).map((p) => ({
            path: `/blog/${p.slug}`,
            lastmod: p.updated_at,
            changefreq: "weekly",
            priority: "0.8",
          })),
          ...(cats ?? []).map((c) => ({
            path: `/blog/c/${c.slug}`,
            changefreq: "weekly",
            priority: "0.6",
          })),
          ...(prog ?? []).map((p) => ({
            path: `/blog/${p.slug}`,
            lastmod: p.updated_at,
            changefreq: "monthly",
            priority: "0.7",
          })),
        ];

        const urls = entries.map((e) =>
          [
            "  <url>",
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            "  </url>",
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...urls,
          "</urlset>",
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
