import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BASE_URL = "https://swift-proxy-spark.lovable.app";

function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const Route = createFileRoute("/rss.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { data: posts } = await supabaseAdmin
          .from("posts")
          .select("slug, title, excerpt, published_at")
          .eq("status", "published")
          .lte("published_at", new Date().toISOString())
          .order("published_at", { ascending: false })
          .limit(30);

        const items = (posts ?? [])
          .map(
            (p) => `    <item>
      <title>${xmlEscape(p.title)}</title>
      <link>${BASE_URL}/blog/${p.slug}</link>
      <guid isPermaLink="true">${BASE_URL}/blog/${p.slug}</guid>
      <description>${xmlEscape(p.excerpt ?? "")}</description>
      <pubDate>${new Date(p.published_at ?? new Date()).toUTCString()}</pubDate>
    </item>`,
          )
          .join("\n");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>FastProxy Blog</title>
    <link>${BASE_URL}/blog</link>
    <description>Guias, comparativos e tutoriais sobre proxies.</description>
    <language>pt-BR</language>
${items}
  </channel>
</rss>`;
        return new Response(xml, {
          headers: {
            "Content-Type": "application/rss+xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
