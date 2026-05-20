import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

/**
 * Renderer markdown sanitizado.
 * remark-gfm: tabelas, listas com checkbox, links automáticos.
 * rehype-sanitize: bloqueia <script>, on-handlers, hrefs javascript:.
 */
export function MarkdownRender({ source }: { source: string }) {
  return (
    <div className="prose prose-invert max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl prose-code:bg-card prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-card prose-pre:border prose-pre:border-border">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
