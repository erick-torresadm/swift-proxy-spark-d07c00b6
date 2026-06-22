export function AuthorBox({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <aside className="mt-12 rounded-2xl border border-border bg-card p-6 flex items-start gap-4">
      <div
        aria-hidden
        className="shrink-0 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center font-black text-primary-foreground"
      >
        {initials || "FP"}
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-1">
          Escrito por
        </p>
        <p className="font-black text-lg leading-tight">{name}</p>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Time editorial da FastProxy. Cobrimos proxies dedicados, scraping,
          automação de tráfego e anti-detecção com foco no mercado brasileiro.
        </p>
      </div>
    </aside>
  );
}
