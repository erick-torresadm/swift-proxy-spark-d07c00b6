import { useState } from "react";
import { Link2, Check } from "lucide-react";
import { toast } from "sonner";

export function ShareBar({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const enc = encodeURIComponent;
  const waUrl = `https://wa.me/?text=${enc(title + " — " + url)}`;
  const xUrl = `https://twitter.com/intent/tweet?text=${enc(title)}&url=${enc(url)}`;
  const liUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  const base =
    "inline-flex items-center justify-center w-10 h-10 rounded-full border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary transition";

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mr-1 hidden sm:inline">
        Compartilhar
      </span>
      <a href={waUrl} target="_blank" rel="noopener noreferrer" aria-label="Compartilhar no WhatsApp" className={base}>
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
          <path d="M20.52 3.48A12 12 0 0 0 2.5 18.7L1 23l4.45-1.45A12 12 0 1 0 20.52 3.48ZM12 21a9 9 0 0 1-4.59-1.25l-.33-.2-2.64.86.87-2.57-.21-.34A9 9 0 1 1 12 21Zm5.1-6.78c-.28-.14-1.65-.81-1.9-.9s-.44-.14-.62.14-.72.9-.88 1.08-.32.2-.6.07a7.4 7.4 0 0 1-2.18-1.35 8.2 8.2 0 0 1-1.5-1.88c-.16-.28 0-.43.12-.57s.28-.32.42-.48a1.94 1.94 0 0 0 .28-.46.5.5 0 0 0 0-.48c-.07-.14-.62-1.5-.85-2.05s-.46-.46-.62-.47h-.53a1 1 0 0 0-.74.34 3.1 3.1 0 0 0-1 2.3 5.43 5.43 0 0 0 1.14 2.86 12.4 12.4 0 0 0 4.76 4.2c.66.29 1.18.46 1.59.59a3.83 3.83 0 0 0 1.76.11 2.87 2.87 0 0 0 1.88-1.33 2.33 2.33 0 0 0 .17-1.33c-.07-.13-.25-.2-.53-.34Z" />
        </svg>
      </a>
      <a href={xUrl} target="_blank" rel="noopener noreferrer" aria-label="Compartilhar no X" className={base}>
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
          <path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.9l-5.4-7.07L4 22H.74l8.04-9.19L1.5 2h7.07l4.88 6.46L18.244 2Zm-1.21 18h1.86L7.04 4H5.06l11.97 16Z" />
        </svg>
      </a>
      <a href={liUrl} target="_blank" rel="noopener noreferrer" aria-label="Compartilhar no LinkedIn" className={base}>
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
          <path d="M4.98 3.5A2.5 2.5 0 1 1 5 8.5a2.5 2.5 0 0 1 0-5ZM3 9.5h4V21H3V9.5Zm6.5 0h3.83v1.57h.05a4.2 4.2 0 0 1 3.78-2.07c4.04 0 4.79 2.66 4.79 6.11V21h-4v-5.13c0-1.22-.02-2.8-1.7-2.8-1.7 0-1.96 1.33-1.96 2.7V21h-4V9.5Z" />
        </svg>
      </a>
      <button onClick={copy} aria-label="Copiar link" className={base}>
        {copied ? <Check className="w-4 h-4 text-primary" /> : <Link2 className="w-4 h-4" />}
      </button>
    </div>
  );
}
