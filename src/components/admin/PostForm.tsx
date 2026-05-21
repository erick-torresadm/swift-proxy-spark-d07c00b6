import { useState, useEffect, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Loader2, Save, Trash2, Plus, X, Sparkles, FileText, Eye, Target,
  CheckCircle2, AlertTriangle, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  upsertPost,
  deletePost,
  listTags as listTagsFn,
  aiGenerateBlog,
} from "@/lib/blog.functions";
import { MarkdownRender } from "@/components/blog/markdown-render";

type Category = { id: string; slug: string; name: string };
type Tag = { id: string; slug: string; name: string };
type FaqItem = { question: string; answer: string };

export type PostFormInitial = {
  id?: string;
  slug?: string;
  title?: string;
  excerpt?: string | null;
  content_md?: string;
  cover_image_url?: string | null;
  status?: "draft" | "published" | "archived";
  category_id?: string | null;
  published_at?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  keyword_primary?: string | null;
  keywords_secondary?: string[];
  faq?: FaqItem[];
  tag_ids?: string[];
  display_author_name?: string | null;
  noindex?: boolean;
  canonical_url?: string | null;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

type Tab = "editor" | "preview" | "seo";

export function PostForm({
  initial,
  categories,
}: {
  initial: PostFormInitial;
  categories: Category[];
}) {
  const navigate = useNavigate();
  const upsertFn = useServerFn(upsertPost);
  const deleteFn = useServerFn(deletePost);
  const listTags = useServerFn(listTagsFn);
  const aiFn = useServerFn(aiGenerateBlog);
  const { data: tags } = useQuery({ queryKey: ["tags"], queryFn: () => listTags() });

  const [tab, setTab] = useState<Tab>("editor");
  const [title, setTitle] = useState(initial.title ?? "");
  const [slug, setSlug] = useState(initial.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!initial.slug);
  const [excerpt, setExcerpt] = useState(initial.excerpt ?? "");
  const [content, setContent] = useState(initial.content_md ?? "");
  const [cover, setCover] = useState(initial.cover_image_url ?? "");
  const [status, setStatus] = useState(initial.status ?? "draft");
  const [categoryId, setCategoryId] = useState(initial.category_id ?? "");
  const [author, setAuthor] = useState(initial.display_author_name ?? "FastProxy");
  const [metaTitle, setMetaTitle] = useState(initial.meta_title ?? "");
  const [metaDesc, setMetaDesc] = useState(initial.meta_description ?? "");
  const [kwPrimary, setKwPrimary] = useState(initial.keyword_primary ?? "");
  const [kwSecondary, setKwSecondary] = useState((initial.keywords_secondary ?? []).join(", "));
  const [tagIds, setTagIds] = useState<string[]>(initial.tag_ids ?? []);
  const [faq, setFaq] = useState<FaqItem[]>(initial.faq ?? []);
  const [noindex, setNoindex] = useState(initial.noindex ?? false);
  const [canonical, setCanonical] = useState(initial.canonical_url ?? "");
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!slugTouched && title) setSlug(slugify(title));
  }, [title, slugTouched]);

  const toggleTag = (id: string) =>
    setTagIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  async function save(nextStatus?: typeof status) {
    setErr(null);
    setSaving(true);
    try {
      const result = await upsertFn({
        data: {
          id: initial.id,
          slug,
          title,
          excerpt: excerpt || null,
          content_md: content,
          cover_image_url: cover || null,
          status: nextStatus ?? status,
          category_id: categoryId || null,
          meta_title: metaTitle || null,
          meta_description: metaDesc || null,
          keyword_primary: kwPrimary || null,
          keywords_secondary: kwSecondary
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 20),
          faq: faq.filter((f) => f.question && f.answer),
          tag_ids: tagIds,
          display_author_name: author || "FastProxy",
          noindex,
          canonical_url: canonical || null,
        },
      });
      if (nextStatus) setStatus(nextStatus);
      toast.success("Salvo!");
      if (!initial.id) navigate({ to: "/admin/blog/$id", params: { id: result.id! } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao salvar";
      setErr(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial.id) return;
    if (!confirm("Excluir este post definitivamente?")) return;
    await deleteFn({ data: { id: initial.id } });
    navigate({ to: "/admin/blog" });
  }

  type AIKind = "title" | "meta_title" | "meta_description" | "excerpt" | "faq" | "outline" | "section" | "rewrite";
  async function ai(kind: AIKind) {
    setAiBusy(kind);
    try {
      const ctx = kind === "title" || kind === "outline"
        ? `Tema/keyword: ${kwPrimary || title}\nResumo desejado: ${excerpt}`
        : `Título: ${title}\nKeyword: ${kwPrimary}\nResumo: ${excerpt}\n\nConteúdo:\n${content.slice(0, 6000)}`;
      const res = (await aiFn({ data: { kind, context: ctx, keyword: kwPrimary || undefined } })) as { text?: string; faq?: FaqItem[] };
      if (kind === "faq" && res.faq && res.faq.length) {
        setFaq([...faq, ...res.faq]);
        toast.success(`${res.faq.length} perguntas adicionadas`);
      } else if (res.text) {
        if (kind === "title") {
          toast.message("Sugestões geradas", { description: res.text });
        } else if (kind === "meta_title") {
          setMetaTitle(res.text.slice(0, 70));
        } else if (kind === "meta_description") {
          setMetaDesc(res.text.slice(0, 180));
        } else if (kind === "excerpt") {
          setExcerpt(res.text.slice(0, 500));
        } else {
          setContent(content + "\n\n" + res.text);
        }
        toast.success("Gerado com IA");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro IA");
    } finally {
      setAiBusy(null);
    }
  }

  // ---- SEO SCORE ----
  const seo = useMemo(() => computeSeo({ title, slug, content, excerpt, cover, metaTitle, metaDesc, kwPrimary, faq }), [title, slug, content, excerpt, cover, metaTitle, metaDesc, kwPrimary, faq]);

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {[
          { id: "editor", label: "Editor", icon: FileText },
          { id: "preview", label: "Preview", icon: Eye },
          { id: "seo", label: `SEO ${seo.score}%`, icon: Target },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px ${
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {err && <span className="text-xs text-destructive">{err}</span>}
          <button
            onClick={() => save("draft")}
            disabled={saving || !title || !slug}
            className="px-3 py-1.5 rounded-lg bg-foreground/5 hover:bg-foreground/10 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Rascunho
          </button>
          <button
            onClick={() => save("published")}
            disabled={saving || !title || !slug}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Publicar
          </button>
        </div>
      </div>

      {tab === "preview" && (
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-10">
          <h1 className="text-3xl sm:text-4xl font-black mb-3">{title || "Sem título"}</h1>
          {excerpt && <p className="text-lg text-muted-foreground mb-6">{excerpt}</p>}
          {cover && <img src={cover} alt={title} className="w-full aspect-[16/9] object-cover rounded-2xl mb-6" />}
          <MarkdownRender source={content || "_(sem conteúdo)_"} />
          {faq.length > 0 && (
            <section className="mt-10 pt-6 border-t border-border">
              <h2 className="text-2xl font-black mb-4">Perguntas frequentes</h2>
              <div className="space-y-3">
                {faq.map((f, i) => (
                  <details key={i} className="bg-background border border-border rounded-xl p-4">
                    <summary className="font-bold cursor-pointer">{f.question}</summary>
                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{f.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {tab === "seo" && <SeoPanel seo={seo} />}

      {tab === "editor" && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <Field
                label="Título"
                action={
                  <AIBtn busy={aiBusy === "title"} onClick={() => ai("title")} label="Sugerir títulos" />
                }
              >
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="Como escolher um proxy residencial"
                  maxLength={200}
                />
                <Hint count={title.length} ideal={60} max={70} />
              </Field>
              <Field label="Slug (URL)">
                <input
                  value={slug}
                  onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
                />
              </Field>
              <Field
                label="Resumo (excerpt)"
                action={<AIBtn busy={aiBusy === "excerpt"} onClick={() => ai("excerpt")} label="Gerar com IA" />}
              >
                <textarea
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm min-h-[70px]"
                  maxLength={500}
                />
              </Field>
              <Field
                label="Conteúdo (Markdown)"
                action={
                  <div className="flex gap-1.5">
                    <AIBtn busy={aiBusy === "outline"} onClick={() => ai("outline")} label="Outline" />
                    <AIBtn busy={aiBusy === "section"} onClick={() => ai("section")} label="+ Seção" />
                    <AIBtn busy={aiBusy === "rewrite"} onClick={() => ai("rewrite")} label="Reescrever" />
                  </div>
                }
              >
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono min-h-[420px]"
                  placeholder={"# Título\n\nSeu conteúdo em **markdown**..."}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {content.trim().split(/\s+/).filter(Boolean).length} palavras
                </p>
              </Field>
              <Field label="Capa (URL da imagem)">
                <input
                  value={cover}
                  onChange={(e) => setCover(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="https://..."
                />
                {cover && (
                  <img src={cover} alt="" className="mt-2 rounded-lg max-h-40 object-cover border border-border" />
                )}
              </Field>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <h3 className="font-bold text-sm flex items-center gap-2"><Target className="w-4 h-4" /> SEO On-page</h3>
              <Field
                label="Meta title (50-60)"
                action={<AIBtn busy={aiBusy === "meta_title"} onClick={() => ai("meta_title")} label="Gerar" />}
              >
                <input
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  maxLength={70}
                />
                <Hint count={metaTitle.length} ideal={60} max={70} />
              </Field>
              <Field
                label="Meta description (140-160)"
                action={<AIBtn busy={aiBusy === "meta_description"} onClick={() => ai("meta_description")} label="Gerar" />}
              >
                <textarea
                  value={metaDesc}
                  onChange={(e) => setMetaDesc(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm min-h-[60px]"
                  maxLength={180}
                />
                <Hint count={metaDesc.length} ideal={160} max={180} />
              </Field>
              <Field label="Palavra-chave principal">
                <input
                  value={kwPrimary}
                  onChange={(e) => setKwPrimary(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  maxLength={80}
                  placeholder="proxy residencial"
                />
              </Field>
              <Field label="Palavras-chave secundárias (vírgula)">
                <input
                  value={kwSecondary}
                  onChange={(e) => setKwSecondary(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="proxy residencial, proxy brasil, comprar proxy"
                />
              </Field>
              <Field label="Canonical URL (opcional)">
                <input
                  value={canonical}
                  onChange={(e) => setCanonical(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
                  placeholder="https://fastproxy.com.br/blog/post-original"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={noindex} onChange={(e) => setNoindex(e.target.checked)} />
                <span>Ocultar do Google (noindex)</span>
              </label>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">Perguntas frequentes (FAQ Schema)</h3>
                <div className="flex gap-1.5">
                  <AIBtn busy={aiBusy === "faq"} onClick={() => ai("faq")} label="Gerar 5 com IA" />
                  <button
                    type="button"
                    onClick={() => setFaq([...faq, { question: "", answer: "" }])}
                    className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md bg-foreground/5 hover:bg-foreground/10"
                  >
                    <Plus className="w-3 h-3" /> Adicionar
                  </button>
                </div>
              </div>
              {faq.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma pergunta cadastrada.</p>}
              {faq.map((f, i) => (
                <div key={i} className="border border-border rounded-lg p-3 space-y-2 relative">
                  <button
                    type="button"
                    onClick={() => setFaq(faq.filter((_, j) => j !== i))}
                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <input
                    value={f.question}
                    onChange={(e) => { const n = [...faq]; n[i] = { ...n[i], question: e.target.value }; setFaq(n); }}
                    placeholder="Pergunta"
                    className="w-full bg-background border border-border rounded px-2 py-1 text-sm font-semibold"
                    maxLength={300}
                  />
                  <textarea
                    value={f.answer}
                    onChange={(e) => { const n = [...faq]; n[i] = { ...n[i], answer: e.target.value }; setFaq(n); }}
                    placeholder="Resposta"
                    className="w-full bg-background border border-border rounded px-2 py-1 text-sm min-h-[60px]"
                    maxLength={2000}
                  />
                </div>
              ))}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3 sticky top-4">
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    status === "published"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : status === "archived"
                        ? "bg-muted text-muted-foreground"
                        : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  {status}
                </span>
                <span
                  className={`text-xs font-bold ${
                    seo.score >= 80 ? "text-emerald-400" : seo.score >= 50 ? "text-amber-400" : "text-destructive"
                  }`}
                >
                  SEO {seo.score}%
                </span>
              </div>
              {initial.id && (
                <button
                  onClick={remove}
                  className="w-full px-3 py-2 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 text-xs font-bold inline-flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir post
                </button>
              )}
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <Field label="Autor exibido">
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="FastProxy"
                  maxLength={80}
                />
              </Field>
              <Field label="Categoria">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">— sem categoria —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tags">
                <div className="flex flex-wrap gap-1.5">
                  {(tags ?? []).map((t: Tag) => {
                    const active = tagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTag(t.id)}
                        className={`px-2 py-1 rounded-full text-[11px] border ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                  {!tags?.length && (
                    <span className="text-xs text-muted-foreground">Nenhuma tag — crie em Tags.</span>
                  )}
                </div>
              </Field>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/* ---------- SEO calculation ---------- */

type SeoCheck = { id: string; label: string; pass: boolean; warn?: boolean; tip?: string };

function computeSeo(p: {
  title: string; slug: string; content: string; excerpt: string;
  cover: string; metaTitle: string; metaDesc: string; kwPrimary: string; faq: FaqItem[];
}) {
  const words = p.content.trim().split(/\s+/).filter(Boolean).length;
  const lower = p.content.toLowerCase();
  const kw = p.kwPrimary.toLowerCase().trim();
  const kwCount = kw ? (lower.match(new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) || []).length : 0;
  const density = kw && words ? (kwCount / words) * 100 : 0;
  const headings = (p.content.match(/^##\s/gm) || []).length;
  const images = (p.content.match(/!\[([^\]]*)\]\(/g) || []);
  const imagesWithAlt = images.filter((m) => !/!\[\s*\]\(/.test(m)).length;
  const internalLinks = (p.content.match(/\]\(\/[^)]*\)/g) || []).length;
  const externalLinks = (p.content.match(/\]\(https?:\/\/[^)]*\)/g) || []).length;

  const checks: SeoCheck[] = [
    {
      id: "title-len",
      label: `Título (${p.title.length} chars)`,
      pass: p.title.length >= 30 && p.title.length <= 65,
      tip: "Entre 30-65 caracteres",
    },
    {
      id: "title-kw",
      label: "Keyword no título",
      pass: !!kw && p.title.toLowerCase().includes(kw),
      tip: "Inclua a palavra-chave no título",
    },
    {
      id: "meta-title",
      label: `Meta title (${p.metaTitle.length})`,
      pass: p.metaTitle.length >= 30 && p.metaTitle.length <= 60,
      tip: "Entre 30-60 caracteres",
    },
    {
      id: "meta-desc",
      label: `Meta description (${p.metaDesc.length})`,
      pass: p.metaDesc.length >= 120 && p.metaDesc.length <= 160,
      tip: "Entre 120-160 caracteres",
    },
    {
      id: "kw",
      label: "Palavra-chave definida",
      pass: !!kw,
    },
    {
      id: "density",
      label: `Densidade keyword (${density.toFixed(2)}%)`,
      pass: density >= 0.5 && density <= 2.5,
      warn: density > 2.5,
      tip: "Ideal entre 0,5% e 2,5%",
    },
    {
      id: "slug-kw",
      label: "Keyword no slug",
      pass: !!kw && p.slug.includes(kw.replace(/\s+/g, "-")),
    },
    {
      id: "length",
      label: `Tamanho (${words} palavras)`,
      pass: words >= 600,
      warn: words >= 300 && words < 600,
      tip: "Posts SEO ranqueiam melhor com 800+ palavras",
    },
    {
      id: "headings",
      label: `H2 (${headings} subtítulos)`,
      pass: headings >= 2,
      tip: "Use H2 (##) pra estruturar a leitura",
    },
    {
      id: "cover",
      label: "Imagem de capa",
      pass: !!p.cover,
    },
    {
      id: "alt",
      label: `Alt em imagens (${imagesWithAlt}/${images.length})`,
      pass: images.length === 0 || imagesWithAlt === images.length,
      tip: "Toda imagem precisa de alt text",
    },
    {
      id: "intlinks",
      label: `Links internos (${internalLinks})`,
      pass: internalLinks >= 2,
      tip: "Adicione ao menos 2 links pra outras páginas do site",
    },
    {
      id: "extlinks",
      label: `Links externos (${externalLinks})`,
      pass: externalLinks >= 1,
      tip: "1+ link pra fonte externa autoritativa",
    },
    {
      id: "excerpt",
      label: "Excerpt definido",
      pass: !!p.excerpt && p.excerpt.length >= 50,
    },
    {
      id: "faq",
      label: `FAQ (${p.faq.length} perguntas)`,
      pass: p.faq.length >= 3,
      warn: p.faq.length > 0 && p.faq.length < 3,
      tip: "FAQ gera rich snippet — adicione 3+",
    },
  ];

  const passed = checks.filter((c) => c.pass).length;
  const score = Math.round((passed / checks.length) * 100);
  return { score, checks, density, words };
}

function SeoPanel({ seo }: { seo: ReturnType<typeof computeSeo> }) {
  const grouped = {
    pass: seo.checks.filter((c) => c.pass),
    warn: seo.checks.filter((c) => !c.pass && c.warn),
    fail: seo.checks.filter((c) => !c.pass && !c.warn),
  };
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="bg-card border border-border rounded-2xl p-6 text-center">
        <p className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Score SEO</p>
        <div className={`text-6xl font-black my-3 ${seo.score >= 80 ? "text-emerald-400" : seo.score >= 50 ? "text-amber-400" : "text-destructive"}`}>
          {seo.score}%
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div>{seo.words} palavras • densidade {seo.density.toFixed(2)}%</div>
          <div>{grouped.pass.length} ok • {grouped.warn.length} alerta • {grouped.fail.length} pendente</div>
        </div>
      </div>
      <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5 space-y-1.5">
        {[...grouped.fail, ...grouped.warn, ...grouped.pass].map((c) => (
          <div key={c.id} className="flex items-start gap-2 text-sm py-1">
            {c.pass ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            ) : c.warn ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            )}
            <div className="flex-1">
              <p className={c.pass ? "text-muted-foreground" : "font-semibold"}>{c.label}</p>
              {!c.pass && c.tip && <p className="text-[11px] text-muted-foreground">{c.tip}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function Field({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        {action}
      </span>
      {children}
    </label>
  );
}

function AIBtn({ busy, onClick, label }: { busy: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 font-bold uppercase tracking-wider"
    >
      {busy ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />}
      {label}
    </button>
  );
}

function Hint({ count, ideal, max }: { count: number; ideal: number; max: number }) {
  const color = count === 0 ? "text-muted-foreground" : count <= ideal ? "text-emerald-400" : count <= max ? "text-amber-400" : "text-destructive";
  return <p className={`text-[11px] mt-1 ${color}`}>{count}/{ideal}{count > ideal && ` (limite ${max})`}</p>;
}
