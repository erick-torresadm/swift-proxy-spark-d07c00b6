import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users2, UserPlus, X, Shield, Pencil, MessageSquare, Loader2 } from "lucide-react";
import { listTeam, assignRoleByEmail, removeRole } from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/admin/equipe")({
  component: TeamPage,
});

type Role = "admin" | "editor" | "moderator";

const roleMeta: Record<Role, { label: string; icon: typeof Shield; cls: string; desc: string }> = {
  admin: {
    label: "Admin",
    icon: Shield,
    cls: "bg-red-500/20 text-red-400 border-red-500/30",
    desc: "Acesso total ao painel",
  },
  editor: {
    label: "Editor",
    icon: Pencil,
    cls: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    desc: "Gerencia blog, categorias, tags e páginas programáticas",
  },
  moderator: {
    label: "Moderador",
    icon: MessageSquare,
    cls: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    desc: "Modera comentários do blog",
  },
};

function TeamPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTeam);
  const assignFn = useServerFn(assignRoleByEmail);
  const removeFn = useServerFn(removeRole);
  const { data, isLoading } = useQuery({ queryKey: ["team"], queryFn: () => listFn() });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function assign() {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await assignFn({ data: { email, role } });
      setOk(`${email} agora é ${roleMeta[role].label}`);
      setEmail("");
      qc.invalidateQueries({ queryKey: ["team"] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(false);
    }
  }

  async function unassign(user_id: string, r: Role) {
    if (!confirm(`Remover papel de ${roleMeta[r].label}?`)) return;
    try {
      await removeFn({ data: { user_id, role: r } });
      qc.invalidateQueries({ queryKey: ["team"] });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha");
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-1">Equipe</h2>
        <p className="text-sm text-muted-foreground">
          Cadastre admins, editores e moderadores. A pessoa precisa já ter criado conta no site.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {isLoading && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Carregando…
              </div>
            )}
            {!isLoading && (data ?? []).length === 0 && (
              <div className="p-10 text-center">
                <Users2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Nenhum membro de equipe ainda — adicione ao lado.
                </p>
              </div>
            )}
            {(data ?? []).map((m) => (
              <div
                key={m.user_id}
                className="flex items-center gap-3 p-4 border-b border-border last:border-b-0"
              >
                <div className="w-9 h-9 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-bold uppercase">
                  {(m.full_name ?? "?").slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{m.full_name ?? "Sem nome"}</p>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">{m.user_id}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {m.roles.map((r) => {
                    const meta = roleMeta[r as Role];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    return (
                      <span
                        key={r}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase border ${meta.cls}`}
                      >
                        <Icon className="w-3 h-3" />
                        {meta.label}
                        <button
                          onClick={() => unassign(m.user_id, r as Role)}
                          className="opacity-70 hover:opacity-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 space-y-4 h-fit">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Adicionar membro
          </h3>
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Email da pessoa
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pessoa@email.com"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Papel
            </span>
            <div className="space-y-1.5">
              {(Object.keys(roleMeta) as Role[]).map((r) => {
                const meta = roleMeta[r];
                const Icon = meta.icon;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`w-full text-left p-3 rounded-lg border transition ${
                      role === r
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-foreground/5"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <Icon className="w-3.5 h-3.5" />
                      <span className="font-bold text-sm">{meta.label}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{meta.desc}</p>
                  </button>
                );
              })}
            </div>
          </label>
          {err && <p className="text-xs text-destructive">{err}</p>}
          {ok && <p className="text-xs text-emerald-400">{ok}</p>}
          <button
            onClick={assign}
            disabled={busy || !email}
            className="w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
