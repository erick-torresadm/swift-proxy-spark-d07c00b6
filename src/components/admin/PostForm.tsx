import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Save, Trash2, Plus, X } from "lucide-react";
import {
  upsertPost,
  deletePost,
  listTags as listTagsFn,
} from "@/lib/blog.functions";

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
  const { data: tags } = useQuery({ queryKey: ["tags"], queryFn: () => listTags() });

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
  const [saving, setSaving] = useState(false);
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
        },
      });
      if (nextStatus) setStatus(nextStatus);
      if (!initial.id) {
        navigate({ to: "/admin/blog/$id", params: { id: result.id! } });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar");
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

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <Field label="Título">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="Como escolher um proxy residencial"
              maxLength={200}
            />
          </Field>
          <Field label="Slug (URL)">
            <input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="como-escolher-um-proxy-residencial"
            />
          </Field>
          <Field label="Resumo (excerpt)">
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm min-h-[70px]"
              maxLength={500}
            />
          </Field>
          <Field label="Conteúdo (Markdown)">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono min-h-[400px]"
              placeholder={"# Título\n\nSeu conteúdo em **markdown**..."}
            />
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
          <h3 className="font-bold text-sm">SEO</h3>
          <Field label="Meta title (≤ 60)">
            <input
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              maxLength={70}
            />
            <p className="text-[11px] text-muted-foreground mt-1">{metaTitle.length}/60</p>
          </Field>
          <Field label="Meta description (≤ 160)">
            <textarea
              value={metaDesc}
              onChange={(e) => setMetaDesc(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm min-h-[60px]"
              maxLength={180}
            />
            <p className="text-[11px] text-muted-foreground mt-1">{metaDesc.length}/160</p>
          </Field>
          <Field label="Palavra-chave principal">
            <input
              value={kwPrimary}
              onChange={(e) => setKwPrimary(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              maxLength={80}
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
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm">Perguntas frequentes (FAQ Schema)</h3>
            <button
              type="button"
              onClick={() => setFaq([...faq, { question: "", answer: "" }])}
              className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md bg-foreground/5 hover:bg-foreground/10"
            >
              <Plus className="w-3 h-3" /> Adicionar
            </button>
          </div>
          {faq.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma pergunta cadastrada.</p>
          )}
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
                onChange={(e) => {
                  const next = [...faq];
                  next[i] = { ...next[i], question: e.target.value };
                  setFaq(next);
                }}
                placeholder="Pergunta"
                className="w-full bg-background border border-border rounded px-2 py-1 text-sm font-semibold"
                maxLength={300}
              />
              <textarea
                value={f.answer}
                onChange={(e) => {
                  const next = [...faq];
                  next[i] = { ...next[i], answer: e.target.value };
                  setFaq(next);
                }}
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
          <div className="flex items-center gap-2">
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
          </div>
          {err && (
            <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">{err}</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => save("draft")}
              disabled={saving || !title || !slug}
              className="px-3 py-2 rounded-lg bg-foreground/5 hover:bg-foreground/10 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Rascunho
            </button>
            <button
              onClick={() => save("published")}
              disabled={saving || !title || !slug}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Publicar
            </button>
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
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
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
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
