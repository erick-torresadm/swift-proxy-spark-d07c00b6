import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

const BASE_URL = "https://www.fastproxy.com.br";

// Mercados-alvo com alto poder de compra. Para páginas SEM tradução real,
// hreflang aponta pra mesma URL (PT) — sinal de mercado-alvo. Para posts
// COM tradução real, cada idioma tem URL própria /{locale}/blog/{slug}.
const SHELL_HREFLANGS = [
  "x-default",
  "pt-BR",
  "en", "en-US", "en-GB", "en-CA", "en-AU", "en-NZ", "en-IE", "en-SG",
  "de-DE", "de-CH", "de-AT",
  "fr-FR", "fr-CH",
  "es-ES",
  "it-IT",
  "nl-NL",
  "sv-SE", "nb-NO", "da-DK",
  "ja-JP",
];

interface Entry {
  path: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
  // Per-URL hreflang block. If provided, replaces the default SHELL_HREFLANGS.
  alternates?: Array<{ hreflang: string; href: string }>;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const staticEntries: Entry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/proxy-ipv6", changefreq: "weekly", priority: "0.95" },
          { path: "/proxy-ipv4", changefreq: "weekly", priority: "0.95" },
          { path: "/proxy-isp", changefreq: "weekly", priority: "0.95" },
          { path: "/proxy-facebook-ads", changefreq: "weekly", priority: "0.95" },
          { path: "/blog", changefreq: "daily", priority: "0.9" },
          { path: "/login", changefreq: "monthly", priority: "0.3" },
          { path: "/signup", changefreq: "monthly", priority: "0.3" },
          { path: "/privacidade", changefreq: "yearly", priority: "0.4" },
          { path: "/termos", changefreq: "yearly", priority: "0.4" },
          { path: "/reembolso", changefreq: "yearly", priority: "0.4" },
        ];

        const [{ data: posts }, { data: translations }, { data: cats }, { data: prog }] =
          await Promise.all([
            supabaseAdmin
              .from("posts")
              .select("id, slug, updated_at")
              .eq("status", "published")
              .lte("published_at", new Date().toISOString())
              .limit(5000),
            supabaseAdmin
              .from("post_translations" as never)
              .select("post_id, locale, slug, updated_at")
              .limit(20000),
            supabaseAdmin.from("post_categories").select("slug").limit(500),
            supabaseAdmin
              .from("programmatic_pages")
              .select("slug, updated_at")
              .eq("active", true)
              .limit(5000),
          ]);

        // Group translations by post_id
        type TR = { post_id: string; locale: string; slug: string; updated_at: string };
        const byPost = new Map<string, TR[]>();
        for (const t of ((translations as unknown as TR[] | null) ?? [])) {
          const arr = byPost.get(t.post_id) ?? [];
          arr.push(t);
          byPost.set(t.post_id, arr);
        }

        const entries: Entry[] = [...staticEntries];

        // Posts in PT + each available translation, each cross-linked via hreflang
        for (const p of posts ?? []) {
          const trs = byPost.get(p.id) ?? [];
          const ptUrl = `${BASE_URL}/blog/${p.slug}`;

          // Build the cluster of alternates that all sibling URLs will share
          const alternates: Array<{ hreflang: string; href: string }> = [
            { hreflang: "x-default", href: ptUrl },
            { hreflang: "pt-BR", href: ptUrl },
          ];
          for (const t of trs) {
            alternates.push({
              hreflang: t.locale,
              href: `${BASE_URL}/${t.locale}/blog/${t.slug}`,
            });
          }

          // PT canonical entry
          entries.push({
            path: `/blog/${p.slug}`,
            lastmod: p.updated_at,
            changefreq: "weekly",
            priority: "0.8",
            alternates,
          });
          // One entry per translation, same alternates block
          for (const t of trs) {
            entries.push({
              path: `/${t.locale}/blog/${t.slug}`,
              lastmod: t.updated_at,
              changefreq: "weekly",
              priority: "0.75",
              alternates,
            });
          }
        }

        // Translated /<locale>/blog index pages
        const localesPresent = Array.from(new Set(((translations as unknown as TR[] | null) ?? []).map((t) => t.locale)));
        for (const loc of localesPresent) {
          entries.push({
            path: `/${loc}/blog`,
            changefreq: "daily",
            priority: "0.7",
            alternates: [
              { hreflang: "x-default", href: `${BASE_URL}/blog` },
              { hreflang: "pt-BR", href: `${BASE_URL}/blog` },
              ...localesPresent.map((l) => ({
                hreflang: l,
                href: `${BASE_URL}/${l}/blog`,
              })),
            ],
          });
        }

        for (const c of cats ?? []) {
          entries.push({ path: `/blog/c/${c.slug}`, changefreq: "weekly", priority: "0.6" });
        }
        for (const p of prog ?? []) {
          entries.push({
            path: `/blog/${p.slug}`,
            lastmod: p.updated_at,
            changefreq: "monthly",
            priority: "0.7",
          });
        }

        const urls = entries.map((e) => {
          const loc = `${BASE_URL}${e.path}`;
          const alts = e.alternates
            ? e.alternates
                .map(
                  (a) =>
                    `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${escapeXml(a.href)}" />`,
                )
                .join("\n")
            : SHELL_HREFLANGS.map(
                (lang) =>
                  `    <xhtml:link rel="alternate" hreflang="${lang}" href="${escapeXml(loc)}" />`,
              ).join("\n");
          return [
            "  <url>",
            `    <loc>${escapeXml(loc)}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            alts,
            "  </url>",
          ]
            .filter(Boolean)
            .join("\n");
        });

        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
          ...urls,
          "</urlset>",
        ].join("\n");

        return new Response(xml, {
          status: 200,
          headers: new Headers({
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          }),
        });
      },
    },
  },
});
