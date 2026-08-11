import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Eye, EyeOff, Copy, Check, ShieldAlert, Key, Download, Loader2, Code2,
  Database, AlertTriangle, Info,
} from "lucide-react";
import { toast } from "sonner";
import { getMigrationBundle } from "@/lib/migration-panel.functions";

export const Route = createFileRoute("/_authenticated/admin/migracao")({
  component: MigrationPanelPage,
});

function mask(v: string) {
  if (!v) return "—";
  if (v.length <= 24) return `${v.slice(0, 4)}•••••${v.slice(-2)}`;
  return `${v.slice(0, 12)}•••••${v.slice(-8)}`;
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function CopyBtn({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (!value) return toast.error("Valor vazio");
        await navigator.clipboard.writeText(value);
        setDone(true);
        toast.success(`${label ?? "Copiado"}!`);
        setTimeout(() => setDone(false), 1200);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-secondary"
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label ?? "Copiar"}
    </button>
  );
}

function SecretRow({ name, value }: { name: string; value: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/60 py-2 last:border-0">
      <span className="min-w-[220px] font-mono text-xs font-semibold text-foreground">{name}</span>
      <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
        {show ? value : mask(value)}
      </span>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground transition hover:bg-secondary"
        aria-label={show ? "Ocultar" : "Revelar"}
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <CopyBtn value={value} />
    </div>
  );
}

function Step({
  n, title, icon, children,
}: { n: number; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <header className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-sm font-black text-primary-foreground">
          {n}
        </span>
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-base font-bold text-foreground">
            Passo {n} — {title}
          </h2>
        </div>
      </header>
      {children}
    </section>
  );
}

function MigrationPanelPage() {
  const fetchBundle = useServerFn(getMigrationBundle);
  const [revealed, setRevealed] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["migration-bundle"],
    queryFn: () => fetchBundle(),
    enabled: revealed,
  });

  const extras = (data?.secrets ?? []).filter(
    (s) => !["FP_SUPABASE_SECRET_KEY"].includes(s.name),
  );

  const copyAll = async () => {
    if (!data) return;
    const txt = [
      "═══ SUPABASE ═══",
      `PROJECT_URL=${data.project_url}`,
      `ANON_KEY=${data.anon_key}`,
      `SERVICE_ROLE_KEY=${data.service_role_key}`,
      "",
      "═══ SECRETS ═══",
      ...extras.map((s) => `${s.name}=${s.value}`),
      "",
      "═══ ENDPOINTS (webhooks/cron) ═══",
      ...data.server_endpoints,
    ].join("\n");
    await navigator.clipboard.writeText(txt);
    toast.success("Tudo copiado");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-black text-foreground">Painel de Migração</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Copie os itens abaixo na ordem e cole na ferramenta de migração / na Vercel.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setRevealed(true);
            refetch();
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90"
        >
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
          Revelar Tudo
        </button>
        {data && (
          <button
            type="button"
            onClick={copyAll}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-secondary"
          >
            <Copy className="h-4 w-4" /> Copiar Tudo
          </button>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p>
          Esta página é restrita a administradores logados — ela mostra chaves secretas.
          Nunca torne esta rota pública nem compartilhe a tela: com a service role key
          qualquer pessoa tem acesso total ao banco.
        </p>
      </div>

      {!data && !isFetching && (
        <p className="text-sm text-muted-foreground">
          Clique em “Revelar Tudo” para carregar credenciais, secrets e tabelas.
        </p>
      )}

      {data && (
        <>
          <Step n={1} title="Credenciais" icon={<ShieldAlert className="h-4 w-4 text-primary" />}>
            <div className="space-y-1">
              <SecretRow name="PROJECT_URL" value={data.project_url} />
              <SecretRow name="ANON / PUBLISHABLE KEY" value={data.anon_key} />
              <SecretRow name="SERVICE ROLE (SECRET) KEY" value={data.service_role_key} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyBtn value={data.project_url} label="Copiar Project URL" />
              <CopyBtn value={data.service_role_key} label="Copiar Service Role Key" />
            </div>
            {!data.service_role_key && (
              <p className="mt-3 flex items-start gap-2 text-xs text-amber-500">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                A secret key (FP_SUPABASE_SECRET_KEY) ainda não está configurada neste
                ambiente — pegue em Project Settings → API Keys → Secret key.
              </p>
            )}
          </Step>

          <Step n={2} title="Endpoints do servidor" icon={<Code2 className="h-4 w-4 text-primary" />}>
            <p className="mb-3 text-xs text-muted-foreground">
              Este projeto não usa Edge Functions: a lógica roda em server functions e nas
              rotas abaixo. Reaponte webhooks (Stripe/Resend) e crons para o novo domínio.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.server_endpoints.map((e) => (
                <span
                  key={e}
                  className="rounded-lg border border-border bg-secondary/50 px-2 py-1 font-mono text-[11px] text-foreground"
                >
                  {e}
                </span>
              ))}
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => {
                  download("endpoints.txt", data.server_endpoints.join("\n"));
                  toast.success(`${data.server_endpoints.length} endpoints`);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium transition hover:bg-secondary"
              >
                <Download className="h-3.5 w-3.5" /> Baixar endpoints.txt
              </button>
            </div>
          </Step>

          <Step n={3} title="Secrets / variáveis de ambiente" icon={<Key className="h-4 w-4 text-primary" />}>
            <div className="space-y-1">
              {extras.map((s) => (
                <SecretRow key={s.name} name={s.name} value={s.value} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const body = extras
                    .map((s) => `  ${JSON.stringify(s.name)}: ${JSON.stringify(s.value)},`)
                    .join("\n");
                  download(
                    "secrets.ts",
                    `export const SECRETS = {\n${body}\n} as const;\n\nexport type SecretKey = keyof typeof SECRETS;\n`,
                  );
                  toast.success(`${extras.length} secrets`);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium transition hover:bg-secondary"
              >
                <Download className="h-3.5 w-3.5" /> Baixar secrets.ts
              </button>
              <button
                type="button"
                onClick={() => {
                  download(
                    ".env.migracao",
                    extras.map((s) => `${s.name}="${s.value}"`).join("\n") + "\n",
                  );
                  toast.success("Arquivo .env gerado");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium transition hover:bg-secondary"
              >
                <Download className="h-3.5 w-3.5" /> Baixar .env
              </button>
            </div>
          </Step>

          <Step n={4} title="Conferência do banco" icon={<Database className="h-4 w-4 text-primary" />}>
            {data.tables_error ? (
              <p className="text-xs text-amber-500">
                Não foi possível listar as tabelas: {data.tables_error}
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs text-muted-foreground">
                  {data.database_tables.length} tabelas no schema public.
                </p>
                <div className="max-h-72 space-y-1 overflow-auto">
                  {data.database_tables.map((t) => {
                    const cls =
                      t.table_name === "audit_log" || t.table_name.includes("metrics")
                        ? "Histórico"
                        : t.table_name.startsWith("rate_limit") || t.table_name.includes("nonces")
                          ? "Ignorar"
                          : "Essencial";
                    return (
                      <div
                        key={t.table_name}
                        className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5 text-xs last:border-0"
                      >
                        <span className="font-mono text-foreground">{t.table_name}</span>
                        <span className="text-muted-foreground">
                          {t.row_count.toLocaleString("pt-BR")} linhas
                        </span>
                        <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {cls}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Senhas são armazenadas como hash bcrypt: se o JWT secret do destino mudar, as
              sessões antigas caem, mas as senhas continuam válidas.
            </p>
          </Step>
        </>
      )}
    </div>
  );
}
