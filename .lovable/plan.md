# Plano — Sync ProxySeller + Renovação Inteligente

## Catálogo confirmado (BR e EUA)
| Categoria  | BR | EUA |
|------------|----|-----|
| IPv4       | ✅ ipv4-br | ✅ ipv4-us |
| IPv6       | ✅ ipv6-br | ✅ ipv6-us |
| IPv6 FB    | ✅ ipv6-fb-br | ✅ ipv6-fb-us |
| ISP        | ✅ isp-br | ❌ (não tenho) |

Todo o pipeline trata BR e EUA simetricamente. ISP-US fica fora do sync/renewal pois não há produto.

## Já feito nesta sessão
1. **Migration** `pick_consolidated_stock(product_ids uuid[], limit int)` (SECURITY DEFINER, só service_role) — devolve estoque livre ordenado por **ocupação do bloco DESC** + `expires_at ASC`. Garante que blocos parcialmente cheios sejam preenchidos primeiro, deixando blocos vazios prontos para expirar.
2. Índice parcial `idx_customer_proxies_status_stock` para acelerar a contagem de ocupação.

## A fazer (quando sair do plan mode)

### 1. `src/lib/allocation.server.ts`
- Reescrever `pickAvailableStockWithSiblings` para usar a RPC `pick_consolidated_stock` (pool = produto + irmãos da MESMA família e MESMO país — funciona tanto para BR quanto US IPv6/IPv6-FB). Mantém fallback in-process se a RPC falhar.
- Adicionar e exportar:
  - `runFullProviderSync()`: itera todos os produtos com `provider_tariff_id` (todas as 4 categorias × 2 países = 7 produtos), chama `listProxies(kind)`, e insere no `proxy_stock` qualquer IP que ainda não esteja rastreado. Não toca em IPs já alocados a cliente. Reconcilia `expires_at` quando o provedor reporta data nova.
  - `runRenewalSweep()`: para cada `provider_orders` (bloco) IPv6 com `expires_at` entre agora e +3 dias:
    - conta `customer_proxies` em status `active|grace` cujos `stock_id` pertencem ao bloco;
    - **ocupação 0** → não renova, marca stock como `expired` no vencimento e dispara notificação "bloco abandonado, economia de US$ X";
    - **ocupação ≥ 1** → `prolongMake` em **todos** os IPs do bloco (paga os 10) e estende `expires_at` por 30 dias. Loga economia teórica vs renovar tudo.
  - Considera BR e US separadamente (provider_orders já tem `country_code`).

### 2. Endpoints cron
- `src/routes/api/public/hooks/proxyseller-full-sync.ts` — POST, valida via `checkCronAuth`, chama `runFullProviderSync`, retorna sumário.
- `src/routes/api/public/hooks/renewal-sweep.ts` — POST, idem, chama `runRenewalSweep`.

### 3. Cron jobs (migration `pg_cron`)
- `proxyseller-full-sync`: a cada 1 h.
- `renewal-sweep`: 1×/dia às 09:00 UTC.

### 4. `src/lib/inventory.functions.ts`
- Novo server-fn `triggerProviderSync()` (admin-only) que chama `runFullProviderSync` direto.
- Novo server-fn `previewRenewalSweep()` (dry-run) listando blocos que seriam renovados/abandonados nos próximos 3 dias.
- Estender `getInventory()` para retornar **ocupação por bloco** (X/10) — agrupa por `provider_order_id`.

### 5. `src/routes/_authenticated.admin.inventory.index.tsx`
- Botão **"Sincronizar agora com ProxySeller"** (chama `triggerProviderSync`).
- Coluna **Ocupação** (e.g. `7/10`) nas listagens, com badge vermelho para `0/10` (bloco abandonado).
- Filtro "Apenas blocos vazios" + total de US$ economizado em renovação.

### 6. `docs/PROXY-CATALOG.md`
- Documentar a nova ordem de prioridade (consolidação por ocupação) e a regra de abandono.
- Tabela explícita BR vs US, com observação ISP-US indisponível.

## Notas de segurança
- A RPC já é `SECURITY DEFINER` + `EXECUTE` revogado de anon/authenticated (apenas service_role). Linter limpo.
- Nenhum cliente é re-alocado neste plano — apenas IPs livres são realocados, conforme pedido.
