import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Users, ChevronRight } from "lucide-react";
import { listCustomers } from "@/lib/inventory.functions";


export const Route = createFileRoute("/_authenticated/admin/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const fn = useServerFn(listCustomers);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: () => fn(),
  });

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Clientes</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Últimos 200 cadastros e proxies ativos por cliente.
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
                <th className="px-4 py-3 font-bold">Telefone</th>
                <th className="px-4 py-3 font-bold">Cadastro</th>
                <th className="px-4 py-3 font-bold text-right">Proxies ativos</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((c) => (
                <tr key={c.user_id} className="border-t border-border">
                  <td className="px-4 py-3">{c.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right font-bold">{c.active_proxies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
