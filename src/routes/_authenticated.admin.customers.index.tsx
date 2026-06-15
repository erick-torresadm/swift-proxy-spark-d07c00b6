import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Users, ChevronRight, MessageCircle, Mail, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { listCustomers } from "@/lib/inventory.functions";
import { sendDunningEmail } from "@/lib/admin-kpis.functions";

export const Route = createFileRoute("/_authenticated/admin/customers/")({
  component: CustomersPage,
});

function normalizeBrPhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function CustomersPage() {
  const fn = useServerFn(listCustomers);
  const sendFn = useServerFn(sendDunningEmail);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: () => fn(),
  });

  const send = useMutation({
    mutationFn: (vars: { userId: string }) => sendFn({ data: vars }),
    onSuccess: (r) => toast.success(`Email enviado para ${r.sent_to}`),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Clientes</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Últimos 200 cadastros. Use os botões para entrar em contato.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && (data ?? []).length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum cliente cadastrado ainda.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="px-4 py-3 font-bold">Nome</th>
                <th className="px-4 py-3 font-bold">Contato</th>
                <th className="px-4 py-3 font-bold">Cadastro</th>
                <th className="px-4 py-3 font-bold text-right">Proxies</th>
                <th className="px-4 py-3 font-bold text-right">Ações</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((c) => {
                const phoneNorm = normalizeBrPhone(c.phone);
                const waMsg = `Oi ${c.full_name?.split(" ")[0] ?? "tudo bem"}! Aqui é da FastProxy. Como posso te ajudar?`;
                const wa = phoneNorm
                  ? `https://wa.me/${phoneNorm}?text=${encodeURIComponent(waMsg)}`
                  : null;
                return (
                  <tr key={c.user_id} className="border-t border-border hover:bg-muted/30 transition align-top">
                    <td className="px-4 py-3">
                      <Link
                        to="/admin/customers/$userId"
                        params={{ userId: c.user_id }}
                        className="font-semibold hover:text-primary"
                      >
                        {c.full_name ?? "—"}
                      </Link>
                      {c.past_due > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-destructive/15 text-destructive">
                          <AlertTriangle className="w-3 h-3" /> {c.past_due} pendente(s)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div className="truncate max-w-[220px]">{c.email ?? "sem email"}</div>
                      <div>{c.phone ?? "sem telefone"}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(c.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">{c.active_proxies}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1.5">
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir WhatsApp"
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {c.email && (
                          <button
                            type="button"
                            disabled={send.isPending}
                            onClick={() => send.mutate({ userId: c.user_id })}
                            title="Enviar email de cobrança"
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-muted"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to="/admin/customers/$userId"
                        params={{ userId: c.user_id }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
