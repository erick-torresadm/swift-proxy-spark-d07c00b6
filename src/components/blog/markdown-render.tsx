import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeRaw from "rehype-raw";

const INTERNAL_HOSTS = new Set([
  "fastproxy.com.br",
  "www.fastproxy.com.br",
  "swift-proxy-spark.lovable.app",
  "id-preview--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app",
  "localhost",
]);

function isExternalHref(href: string | undefined): boolean {
  if (!href) return false;
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    const url = new URL(href);
    return !INTERNAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Sanitize schema extension: permite IDs em headings (necessário p/ TOC e
 * deep-links), a classe `anchor` que o autolink injeta, e target/rel nos
 * links para abertura em nova aba.
 */
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    h1: [...(defaultSchema.attributes?.h1 ?? []), "id"],
    h2: [...(defaultSchema.attributes?.h2 ?? []), "id"],
    h3: [...(defaultSchema.attributes?.h3 ?? []), "id"],
    h4: [...(defaultSchema.attributes?.h4 ?? []), "id"],
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      ["className", "anchor"],
      "ariaLabel",
      "target",
      "rel",
    ],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      "loading",
      "decoding",
    ],
  },
};

/**
 * Renderer markdown editorial: tipografia calibrada para leitura longa,
 * com hierarquia clara, ritmo vertical generoso, listas/citações/tabelas
 * tratadas como elementos de design.
 */
export function MarkdownRender({ source }: { source: string }) {
  return (
    <div
      className="
        text-[1.0625rem] leading-[1.85] text-foreground/90
        [&>*+*]:mt-6
        [&>h2]:text-3xl sm:[&>h2]:text-4xl [&>h2]:font-black [&>h2]:tracking-tight [&>h2]:text-foreground
        [&>h2]:mt-16 [&>h2]:mb-2 [&>h2]:scroll-mt-24
        [&>h3]:text-2xl [&>h3]:font-black [&>h3]:tracking-tight [&>h3]:text-foreground
        [&>h3]:mt-12 [&>h3]:mb-1 [&>h3]:scroll-mt-24
        [&>h4]:text-xl [&>h4]:font-bold [&>h4]:mt-10 [&>h4]:mb-1

        [&>p]:text-[1.0625rem] [&>p]:leading-[1.85]
        [&_strong]:text-foreground [&_strong]:font-bold
        [&_em]:italic

        [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-primary/40 hover:[&_a]:decoration-primary [&_a]:transition

        [&>ul]:pl-0 [&>ul]:list-none [&>ul>li]:relative [&>ul>li]:pl-7 [&>ul>li]:mt-3
        [&>ul>li]:before:content-[''] [&>ul>li]:before:absolute [&>ul>li]:before:left-1 [&>ul>li]:before:top-[0.7em]
        [&>ul>li]:before:w-2 [&>ul>li]:before:h-2 [&>ul>li]:before:rounded-full [&>ul>li]:before:bg-primary

        [&>ol]:pl-6 [&>ol]:list-decimal [&>ol>li]:mt-3 [&>ol>li]:pl-2 [&>ol]:marker:text-primary [&>ol]:marker:font-black

        [&>blockquote]:border-l-4 [&>blockquote]:border-primary [&>blockquote]:bg-card
        [&>blockquote]:rounded-r-xl [&>blockquote]:py-4 [&>blockquote]:px-6 [&>blockquote]:my-8
        [&>blockquote_p]:italic [&>blockquote_p]:text-foreground/85 [&>blockquote_p]:text-lg [&>blockquote_p]:leading-relaxed

        [&_code]:bg-card [&_code]:border [&_code]:border-border [&_code]:rounded-md
        [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_code]:font-mono [&_code]:text-primary

        [&>pre]:bg-card [&>pre]:border [&>pre]:border-border [&>pre]:rounded-2xl
        [&>pre]:p-5 [&>pre]:my-8 [&>pre]:overflow-x-auto [&>pre]:text-sm
        [&>pre>code]:bg-transparent [&>pre>code]:border-0 [&>pre>code]:p-0 [&>pre>code]:text-foreground

        [&>hr]:my-12 [&>hr]:border-0 [&>hr]:h-px [&>hr]:bg-gradient-to-r [&>hr]:from-transparent [&>hr]:via-border [&>hr]:to-transparent

        [&>img]:rounded-2xl [&>img]:my-10 [&>img]:border [&>img]:border-border [&>img]:shadow-lg [&>img]:w-full
        [&>p>img]:rounded-2xl [&>p>img]:my-10 [&>p>img]:border [&>p>img]:border-border [&>p>img]:shadow-lg [&>p>img]:w-full

        [&_table]:w-full [&_table]:my-8 [&_table]:border-collapse [&_table]:text-sm
        [&_th]:bg-card [&_th]:border [&_th]:border-border [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:font-bold
        [&_td]:border [&_td]:border-border [&_td]:px-4 [&_td]:py-3
        [&_tbody_tr:nth-child(even)]:bg-card/50

        [&_h2_a.anchor]:no-underline [&_h2_a.anchor]:text-foreground
        [&_h3_a.anchor]:no-underline [&_h3_a.anchor]:text-foreground
      "
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, schema],
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            {
              behavior: "wrap",
              properties: { className: "anchor", ariaLabel: "Link permanente" },
            },
          ],
        ]}
        components={{
          img: ({ node: _node, ...props }) => (
            <img loading="lazy" decoding="async" {...props} />
          ),
          a: ({ node: _node, children, href, target, rel, ...props }) => {
            const isBlank = target === "_blank" || (!target && isExternalHref(href));
            return (
              <a
                href={href}
                target={isBlank ? "_blank" : target}
                rel={isBlank ? "noopener noreferrer" : rel}
                {...props}
              >
                {children}
                {isBlank && (
                  <span className="inline-block align-middle ml-0.5 opacity-60" aria-hidden="true">
                    ↗
                  </span>
                )}
              </a>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
