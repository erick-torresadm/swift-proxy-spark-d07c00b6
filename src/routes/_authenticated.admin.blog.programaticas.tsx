import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Layers, Trash2, Power } from "lucide-react";
import {
  listProgrammaticAdmin,
  generateProgrammaticBulk,
  toggleProgrammatic,
  deleteProgrammatic,
} from "@/lib/blog.functions";

export const Route = createFileRoute("/_authenticated/admin/blog/programaticas")({
  component: ProgrammaticPage,
});

function ProgrammaticPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listProgrammaticAdmin);
  const genFn = useServerFn(generateProgrammaticBulk);
  const toggleFn = useServerFn(toggleProgrammatic);
  const delFn = useServerFn(deleteProgrammatic);
  const { data } = useQuery({ queryKey: ["programmatic"], queryFn: () => listFn() });

  const [groupName, setGroupName] = useState("");
  const [slugTpl, setSlugTpl] = useState("proxy-{country}-{city}");
  const [titleTpl, setTitleTpl] = useState("Proxy {country} em {city}");
  const [excerptTpl, setExcerptTpl] = useState("Proxies premium em {city}, {country}.");
  const [metaTpl, setMetaTpl] = useState("Compre proxy em {city}, {country} com 99,9% uptime.");
  const [kwTpl, setKwTpl] = useState("proxy {city} {country}");
  const [contentTpl, setContentTpl] = useState(
    "# Proxy em {city}, {country}\n\nIPs residenciais geo-localizados em {city}.\n\n## Por que escolher\n- IPs limpos em {country}\n- Suporte BR\n",
  );
  const [itemsJson, setItemsJson] = useState(
    '[{"country":"Brasil","city":"São Paulo"},{"country":"Brasil","city":"Rio de Janeiro"}]',
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const items = JSON.parse(itemsJson);
      const r = await genFn({
        data: {
          group_name: groupName,
          slug_template: slugTpl,
          title_template: titleTpl,
          excerpt_template: excerptTpl,
          meta_description_template: metaTpl,
          keyword_template: kwTpl,
          content_template: contentTpl,
          items,
        },
      });
      alert(`Geradas ${r.inserted} páginas`);
      qc.invalidateQueries({ queryKey: ["programmatic"] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Layers className="w-4 h-4" /> Gerar em lote
        </h3>
        <Field label="Nome do grupo">
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} className={inp} />
        </Field>
        <Field label="Template de slug">
          <input value={slugTpl} onChange={(e) => setSlugTpl(e.target.value)} className={`${inp} font-mono`} />
        </Field>
        <Field label="Template de título">
          <input value={titleTpl} onChange={(e) => setTitleTpl(e.target.value)} className={inp} />
        </Field>
        <Field label="Template de excerpt">
          <input value={excerptTpl} onChange={(e) => setExcerptTpl(e.target.value)} className={inp} />
        </Field>
        <Field label="Template meta description">
          <input value={metaTpl} onChange={(e) => setMetaTpl(e.target.value)} className={inp} />
        </Field>
        <Field label="Template palavra-chave">
          <input value={kwTpl} onChange={(e) => setKwTpl(e.target.value)} className={inp} />
        </Field>
        <Field label="Conteúdo (markdown)">
          <textarea
            value={contentTpl}
            onChange={(e) => setContentTpl(e.target.value)}
            className={`${inp} font-mono min-h-[160px]`}
          />
        </Field>
        <Field label='Itens (JSON: [{"country":"...", "city":"..."}, ...])'>
          <textarea
            value={itemsJson}
            onChange={(e) => setItemsJson(e.target.value)}
            className={`${inp} font-mono min-h-[120px]`}
          />
        </Field>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <button
          onClick={generate}
          disabled={busy || !groupName}
          className="w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
          Gerar páginas
        </button>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden h-fit">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-left">
              <th className="px-4 py-3 font-bold">Slug</th>
              <th className="px-4 py-3 font-bold">Grupo</th>
              <th className="px-4 py-3 font-bold">Ativa</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{p.slug}</td>
                <td className="px-4 py-2 text-xs">{p.group_name ?? "—"}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={async () => {
                      await toggleFn({ data: { id: p.id, active: !p.active } });
                      qc.invalidateQueries({ queryKey: ["programmatic"] });
                    }}
                    className={`p-1 rounded ${p.active ? "text-emerald-400" : "text-muted-foreground"}`}
                  >
                    <Power className="w-3.5 h-3.5" />
                  </button>
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={async () => {
                      if (!confirm("Excluir?")) return;
                      await delFn({ data: { id: p.id } });
                      qc.invalidateQueries({ queryKey: ["programmatic"] });
                    }}
                    className="text-destructive hover:bg-destructive/10 p-1 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhuma página programática
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inp =
  "w-full bg-background border border-border rounded-lg px-3 py-2 text-sm";

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
