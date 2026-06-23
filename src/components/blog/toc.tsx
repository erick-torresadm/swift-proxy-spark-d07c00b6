import { useEffect, useMemo, useState } from "react";
import { List } from "lucide-react";

type Heading = { id: string; text: string; level: 2 | 3 };

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function extract(md: string): Heading[] {
  const lines = md.split("\n");
  const out: Heading[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const level = m[1].length as 2 | 3;
    const text = m[2]
      .replace(/<[^>]+>/g, "") // strip HTML tags (e.g. <a href...>)
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images -> alt
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // md links -> text
      .replace(/[*_`]/g, "")
      .trim();
    out.push({ id: slugify(text), text, level });
  }
  return out;
}

export function TableOfContents({ source }: { source: string }) {
  const headings = useMemo(() => extract(source), [source]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (headings.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav
      aria-label="Sumário do artigo"
      className="rounded-2xl border border-border bg-card/50 p-5"
    >
      <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
        <List className="w-3.5 h-3.5" /> Sumário
      </h2>
      <ul className="space-y-1.5 text-sm">
        {headings.map((h) => (
          <li key={h.id} className={h.level === 3 ? "pl-4" : ""}>
            <a
              href={`#${h.id}`}
              className={`block py-1 border-l-2 pl-3 transition leading-snug ${
                active === h.id
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
