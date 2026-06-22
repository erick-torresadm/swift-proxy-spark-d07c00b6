import { useRef, useCallback, useState } from "react";
import {
  Bold, Italic, Link as LinkIcon, Heading2, Heading3, List, ListOrdered,
  Quote, Code, Image as ImageIcon, Minus, Strikethrough, Table as TableIcon,
  CheckSquare, ExternalLink, X,
} from "lucide-react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
};

type Action = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  run: (api: EditorAPI) => void;
};

type EditorAPI = {
  wrap: (before: string, after?: string, placeholder?: string) => void;
  linePrefix: (prefix: string) => void;
  insert: (text: string) => void;
  link: () => void;
  image: () => void;
  table: () => void;
};

export function MarkdownEditor({ value, onChange, placeholder, minHeight = 420 }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [dialog, setDialog] = useState<{
    open: boolean;
    url: string;
    text: string;
    newTab: boolean;
    selectionStart: number;
    selectionEnd: number;
  }>({ open: false, url: "https://", text: "", newTab: true, selectionStart: 0, selectionEnd: 0 });

  const setValueWithSelection = (next: string, selStart: number, selEnd: number) => {
    onChange(next);
    requestAnimationFrame(() => {
      const ta = ref.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(selStart, selEnd);
    });
  };

  const api: EditorAPI = {
    wrap: (before, after = before, placeholder = "") => {
      const ta = ref.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = value.slice(start, end) || placeholder;
      const next = value.slice(0, start) + before + selected + after + value.slice(end);
      const cursorStart = start + before.length;
      setValueWithSelection(next, cursorStart, cursorStart + selected.length);
    },
    linePrefix: (prefix) => {
      const ta = ref.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const lineEndIdx = value.indexOf("\n", end);
      const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
      const block = value.slice(lineStart, lineEnd);
      const lines = block.split("\n");
      const allHave = lines.every((l) => l.startsWith(prefix));
      const newBlock = lines
        .map((l, i) => {
          if (allHave) return l.slice(prefix.length);
          if (prefix.match(/^\d/)) return `${i + 1}. ${l.replace(/^\d+\.\s*/, "")}`;
          return prefix + l;
        })
        .join("\n");
      const next = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
      const delta = newBlock.length - block.length;
      setValueWithSelection(next, start + (allHave ? -prefix.length : prefix.length), end + delta);
    },
    insert: (text) => {
      const ta = ref.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = value.slice(0, start) + text + value.slice(end);
      setValueWithSelection(next, start + text.length, start + text.length);
    },
    link: () => {
      const ta = ref.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = value.slice(start, end);
      setDialog({
        open: true,
        url: "https://",
        text: selected,
        newTab: true,
        selectionStart: start,
        selectionEnd: end,
      });
    },
    image: () => {
      const url = window.prompt("URL da imagem:", "https://");
      if (!url) return;
      const alt = window.prompt("Texto alternativo (alt):", "") || "";
      api.insert(`\n![${alt}](${url})\n`);
    },
    table: () => {
      api.insert(
        "\n| Coluna 1 | Coluna 2 | Coluna 3 |\n| --- | --- | --- |\n| valor | valor | valor |\n| valor | valor | valor |\n",
      );
    },
  };

  const applyLink = () => {
    if (!dialog.open) return;
    const { selectionStart, selectionEnd, url, text, newTab } = dialog;
    const linkText = text.trim() || url;
    let insert = "";
    if (newTab) {
      insert = `<a href="${url}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
    } else {
      insert = `[${linkText}](${url})`;
    }
    const next = value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
    setValueWithSelection(next, selectionStart + insert.length, selectionStart + insert.length);
    setDialog((d) => ({ ...d, open: false }));
  };

  const closeDialog = () => setDialog((d) => ({ ...d, open: false }));

  const actions: Action[] = [
    { icon: Heading2, label: "Título H2", shortcut: "Ctrl+2", run: (a) => a.linePrefix("## ") },
    { icon: Heading3, label: "Título H3", shortcut: "Ctrl+3", run: (a) => a.linePrefix("### ") },
    { icon: Bold, label: "Negrito", shortcut: "Ctrl+B", run: (a) => a.wrap("**", "**", "texto em negrito") },
    { icon: Italic, label: "Itálico", shortcut: "Ctrl+I", run: (a) => a.wrap("*", "*", "texto em itálico") },
    { icon: Strikethrough, label: "Tachado", run: (a) => a.wrap("~~", "~~", "texto") },
    { icon: LinkIcon, label: "Link", shortcut: "Ctrl+K", run: (a) => a.link() },
    { icon: ImageIcon, label: "Imagem", run: (a) => a.image() },
    { icon: List, label: "Lista", shortcut: "Ctrl+L", run: (a) => a.linePrefix("- ") },
    { icon: ListOrdered, label: "Lista numerada", run: (a) => a.linePrefix("1. ") },
    { icon: CheckSquare, label: "Checklist", run: (a) => a.linePrefix("- [ ] ") },
    { icon: Quote, label: "Citação", run: (a) => a.linePrefix("> ") },
    { icon: Code, label: "Código", run: (a) => a.wrap("`", "`", "código") },
    { icon: TableIcon, label: "Tabela", run: (a) => a.table() },
    { icon: Minus, label: "Divisor", run: (a) => a.insert("\n\n---\n\n") },
  ];

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      const map: Record<string, (a: EditorAPI) => void> = {
        b: (a) => a.wrap("**", "**", "texto em negrito"),
        i: (a) => a.wrap("*", "*", "texto em itálico"),
        k: (a) => a.link(),
        l: (a) => a.linePrefix("- "),
        "2": (a) => a.linePrefix("## "),
        "3": (a) => a.linePrefix("### "),
      };
      if (map[k]) {
        e.preventDefault();
        map[k](api);
      }
    },
    [value],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const ta = ref.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      if (start === end) return;
      const text = e.clipboardData.getData("text");
      if (/^https?:\/\/\S+$/i.test(text.trim())) {
        e.preventDefault();
        const selected = value.slice(start, end);
        const url = text.trim();
        const isExternal = !url.includes(window.location.hostname);
        if (isExternal) {
          const insert = `<a href="${url}" target="_blank" rel="noopener noreferrer">${selected}</a>`;
          const next = value.slice(0, start) + insert + value.slice(end);
          setValueWithSelection(next, start + insert.length, start + insert.length);
        } else {
          const md = `[${selected}](${url})`;
          const next = value.slice(0, start) + md + value.slice(end);
          setValueWithSelection(next, start + md.length, start + md.length);
        }
      }
    },
    [value],
  );

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background relative">
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1.5 border-b border-border bg-card/50">
        {actions.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => a.run(api)}
            title={`${a.label}${a.shortcut ? ` (${a.shortcut})` : ""}`}
            className="p-1.5 rounded-md hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition"
          >
            <a.icon className="w-3.5 h-3.5" />
          </button>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground pr-2 hidden sm:inline">
          Markdown · Ctrl+B/I/K · cole URL sobre texto p/ virar link
        </span>
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={placeholder}
        style={{ minHeight }}
        className="w-full bg-background px-3 py-2 text-sm font-mono outline-none resize-y"
      />

      {dialog.open && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-primary" />
                Inserir link
              </h3>
              <button
                type="button"
                onClick={closeDialog}
                className="p-1 rounded-md hover:bg-foreground/10 text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">URL</label>
                <input
                  type="text"
                  value={dialog.url}
                  onChange={(e) => setDialog((d) => ({ ...d, url: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") applyLink(); }}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="https://"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Texto do link</label>
                <input
                  type="text"
                  value={dialog.text}
                  onChange={(e) => setDialog((d) => ({ ...d, text: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") applyLink(); }}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="Clique aqui"
                />
              </div>
              <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dialog.newTab}
                  onChange={(e) => setDialog((d) => ({ ...d, newTab: e.target.checked }))}
                  className="rounded border-border"
                />
                <span className="flex items-center gap-1.5">
                  Abrir em nova aba
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                Dica: links externos (Dolphin, Facebook etc.) ficam no blog; CTAs internos (checkout, venda) podem permanecer na mesma aba.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeDialog}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-muted-foreground hover:bg-foreground/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={applyLink}
                disabled={!dialog.url.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Inserir link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
