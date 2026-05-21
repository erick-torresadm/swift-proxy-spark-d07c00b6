import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Pencil, Trash2, Save, X, User } from "lucide-react";
import {
  listProductStock,
  updateStockItem,
  deleteStockItem,
} from "@/lib/inventory.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_authenticated/admin/inventory/$productId",
)({
  component: ProductStockPage,
});

type StockRow = {
  id: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  protocol: string | null;
  country_code: string | null;
  external_proxy_id: string | null;
  status: string;
  expires_at: string | null;
  allocation: {
    user_id: string;
    order_id: string;
    allocated_at: string;
    status: string;
    full_name: string | null;
  } | null;
};

function ProductStockPage() {
  const { productId } = Route.useParams();
  const qc = useQueryClient();
  const listFn = useServerFn(listProductStock);
  const updateFn = useServerFn(updateStockItem);
  const deleteFn = useServerFn(deleteStockItem);

  const { data, isLoading } = useQuery({
    queryKey: ["product-stock", productId],
    queryFn: () => listFn({ data: { product_id: productId } }),
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<StockRow>>({});

  const updateMut = useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
      toast.success("Proxy atualizado");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["product-stock", productId] });
      qc.invalidateQueries({ queryKey: ["admin-inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      toast.success("Proxy excluído");
      qc.invalidateQueries({ queryKey: ["product-stock", productId] });
      qc.invalidateQueries({ queryKey: ["admin-inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit(s: StockRow) {
    setEditing(s.id);
    setDraft({
      host: s.host,
      port: s.port,
      username: s.username,
      password: s.password,
      protocol: s.protocol,
      country_code: s.country_code,
      external_proxy_id: s.external_proxy_id,
      status: s.status,
    });
  }

  function saveEdit(id: string) {
    updateMut.mutate({
      id,
      host: draft.host,
      port: draft.port ? Number(draft.port) : undefined,
      username: draft.username ?? null,
      password: draft.password ?? null,
      protocol: draft.protocol ?? null,
      country_code: draft.country_code ?? null,
      external_proxy_id: draft.external_proxy_id ?? null,
      status: draft.status as never,
    });
  }

  const product = data?.product;
  const stock = (data?.stock ?? []) as StockRow[];

  return (
    <div>
      <Link
        to="/admin/inventory"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar para estoque
      </Link>

      <h2 className="text-xl font-bold mb-1">
        {product?.name ?? "Produto"}
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        {product?.category} · {product?.country_code} · entrega:{" "}
        {product?.delivery_mode} — {stock.length} proxies
      </p>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      )}

      {!isLoading && stock.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum proxy neste produto.
          </p>
        </div>
      )}

      {stock.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Host:Port</TableHead>
                <TableHead>Credenciais</TableHead>
                <TableHead>Protocolo</TableHead>
                <TableHead>País</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cliente alocado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.map((s) => {
                const isEdit = editing === s.id;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">
                      {isEdit ? (
                        <div className="flex gap-1">
                          <Input
                            className="h-8 w-40"
                            value={draft.host ?? ""}
                            onChange={(e) =>
                              setDraft({ ...draft, host: e.target.value })
                            }
                          />
                          <Input
                            className="h-8 w-20"
                            type="number"
                            value={draft.port ?? ""}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                port: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                      ) : (
                        `${s.host}:${s.port}`
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {isEdit ? (
                        <div className="flex gap-1">
                          <Input
                            className="h-8 w-28"
                            placeholder="user"
                            value={draft.username ?? ""}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                username: e.target.value,
                              })
                            }
                          />
                          <Input
                            className="h-8 w-28"
                            placeholder="pass"
                            value={draft.password ?? ""}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                password: e.target.value,
                              })
                            }
                          />
                        </div>
                      ) : (
                        <span>
                          {s.username ?? "—"}:{s.password ?? "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs uppercase">
                      {isEdit ? (
                        <Input
                          className="h-8 w-20"
                          value={draft.protocol ?? ""}
                          onChange={(e) =>
                            setDraft({ ...draft, protocol: e.target.value })
                          }
                        />
                      ) : (
                        s.protocol ?? "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {isEdit ? (
                        <Input
                          className="h-8 w-16"
                          value={draft.country_code ?? ""}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              country_code: e.target.value,
                            })
                          }
                        />
                      ) : (
                        s.country_code ?? "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {isEdit ? (
                        <select
                          className="h-8 px-2 rounded border border-input bg-background text-xs"
                          value={draft.status ?? s.status}
                          onChange={(e) =>
                            setDraft({ ...draft, status: e.target.value })
                          }
                        >
                          <option value="available">available</option>
                          <option value="allocated">allocated</option>
                          <option value="reserved">reserved</option>
                          <option value="expired">expired</option>
                          <option value="disabled">disabled</option>
                        </select>
                      ) : (
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                            s.status === "available"
                              ? "bg-emerald-500/15 text-emerald-500"
                              : s.status === "allocated"
                                ? "bg-blue-500/15 text-blue-500"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {s.status}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.allocation ? (
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span>
                            {s.allocation.full_name ?? s.allocation.user_id.slice(0, 8)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEdit ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(null)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => saveEdit(s.id)}
                            disabled={updateMut.isPending}
                          >
                            <Save className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(s)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (
                                confirm(
                                  "Excluir este proxy do estoque? Esta ação não pode ser desfeita.",
                                )
                              ) {
                                deleteMut.mutate(s.id);
                              }
                            }}
                            disabled={deleteMut.isPending}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
