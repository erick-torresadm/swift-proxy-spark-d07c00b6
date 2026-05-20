import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ServerCog,
  AlertCircle,
  CheckCircle2,
  Wallet,
  TrendingUp,
  Heart,
  Settings as SettingsIcon,
} from "lucide-react";
import { useState, useEffect } from "react";
import { getProviderStatus, updateProviderSettings } from "@/lib/inventory.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/provider")({
  component: ProviderPage,
});

const fmtUsd = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtBrl = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ProviderPage() {
  const fn = useServerFn(getProviderStatus);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-provider"],
    queryFn: () => fn(),
    refetchInterval: 60000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Provedor — Proxy-Seller</h2>
        <p className="text-sm text-muted-foreground">
          Saldo, cotação, compras automáticas e saúde dos IPs.
        </p>
      </div>

      {/* Cards de status */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={ServerCog}
          label="API"
          value={
            isLoading
              ? "…"
              : data?.api_configured
                ? "Conectada"
                : "Não configurada"
          }
          accent={data?.api_configured ? "ok" : "warn"}
        />
        <StatCard
          icon={Wallet}
          label="Saldo USD"
          value={fmtUsd(data?.balance_usd ?? null)}
          sub={data?.balance_error ? `erro: ${data.balance_error}` : "conta ProxySeller"}
          accent={data?.balance_error ? "err" : "default"}
        />
        <StatCard
          icon={TrendingUp}
          label="Saldo BRL"
          value={fmtBrl(data?.balance_brl ?? null)}
          sub={
            data?.fx_rate
              ? `câmbio R$ ${data.fx_rate.toFixed(4)} (${data.fx_source})`
              : "sem câmbio"
          }
        />
        <StatCard
          icon={Heart}
          label="Eventos abertos"
          value={String(data?.health_events?.length ?? 0)}
          sub="IPs expirando/expirados"
          accent={(data?.health_events?.length ?? 0) > 0 ? "warn" : "ok"}
        />
      </div>

      {/* Configurações */}
      <SettingsCard
        initial={data?.settings ?? null}
        onSaved={() => refetch()}
      />

      {/* Saúde */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <p className="font-bold mb-3 flex items-center gap-2">
          <Heart className="w-4 h-4 text-primary" /> Eventos de saúde (não resolvidos)
        </p>
        {(data?.health_events ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento aberto.</p>
        ) : (
          <div className="space-y-1 text-xs max-h-64 overflow-auto">
            {data!.health_events.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between border-b border-border/50 pb-1.5 last:border-0"
              >
                <div>
                  <span className="font-mono font-bold mr-2">{e.event}</span>
                  <span className="text-muted-foreground">{e.external_proxy_id ?? "—"}</span>
                </div>
                <span className="text-muted-foreground">
                  {new Date(e.detected_at).toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Snapshots de saldo */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <p className="font-bold mb-3">Histórico de saldo (últimos 30 snapshots)</p>
        {(data?.snapshots ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum snapshot ainda — o cron preenche.</p>
        ) : (
          <div className="space-y-1 text-xs max-h-48 overflow-auto">
            {data!.snapshots.map((s, i) => (
              <div key={i} className="flex justify-between border-b border-border/50 pb-1 last:border-0">
                <span className="text-muted-foreground">
                  {new Date(s.fetched_at).toLocaleString("pt-BR")}
                </span>
                <span className="font-mono">{fmtUsd(Number(s.balance_usd))}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Últimas chamadas API */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <p className="font-bold mb-3">Últimas chamadas à API</p>
        {(data?.recent_calls ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma chamada ainda.</p>
        ) : (
          <div className="space-y-2">
            {data!.recent_calls.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between text-xs border-b border-border/50 pb-2 last:border-0"
              >
                <div>
                  <p className="font-mono">{c.action}</p>
                  <p className="text-muted-foreground">
                    {new Date(c.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    c.status === "ok"
                      ? "bg-green-500/15 text-green-500"
                      : "bg-red-500/15 text-red-500"
                  }`}
                >
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = "default",
}: {
  icon: typeof ServerCog;
  label: string;
  value: string;
  sub?: string;
  accent?: "default" | "ok" | "warn" | "err";
}) {
  const color = {
    default: "text-primary",
    ok: "text-green-500",
    warn: "text-amber-500",
    err: "text-red-500",
  }[accent];
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${color} mb-2`}>
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <p className="text-2xl font-black">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function SettingsCard({
  initial,
  onSaved,
}: {
  initial: { min_balance_usd: number; alert_email: string | null; auto_purchase_enabled: boolean } | null;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const save = useServerFn(updateProviderSettings);
  const m = useMutation({
    mutationFn: save,
    onSuccess: () => {
      toast.success("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["admin-provider"] });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [min, setMin] = useState<number>(50);
  const [email, setEmail] = useState<string>("");
  const [auto, setAuto] = useState<boolean>(true);

  useEffect(() => {
    if (initial) {
      setMin(Number(initial.min_balance_usd));
      setEmail(initial.alert_email ?? "");
      setAuto(initial.auto_purchase_enabled);
    }
  }, [initial]);

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <p className="font-bold mb-4 flex items-center gap-2">
        <SettingsIcon className="w-4 h-4 text-primary" /> Configurações
      </p>
      <div className="grid sm:grid-cols-3 gap-4">
        <label className="block">
          <span className="text-xs font-bold text-muted-foreground">Saldo mínimo (USD)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={min}
            onChange={(e) => setMin(Number(e.target.value))}
            className="mt-1 w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-muted-foreground">Email para alerta</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@empresa.com"
            className="mt-1 w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm">Compra automática ativa</span>
        </label>
      </div>
      <div className="flex justify-end mt-4">
        <button
          onClick={() =>
            m.mutate({
              data: {
                min_balance_usd: min,
                alert_email: email || null,
                auto_purchase_enabled: auto,
              },
            })
          }
          disabled={m.isPending}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
        >
          {m.isPending ? "Salvando…" : "Salvar"}
        </button>
      </div>
      {!initial && (
        <p className="text-xs text-amber-500 mt-3 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" /> Carregando configurações…
        </p>
      )}
      {initial && (
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Compras automáticas serão
          bloqueadas se o saldo ficar abaixo do mínimo.
        </p>
      )}
    </div>
  );
}
