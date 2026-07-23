
# Integração da VPS própria como provedor "fastproxy-vps" (IPv6 BR self-hosted)

Objetivo: rotear **novos pedidos de IPv6 BR** para a sua VPS `104.234.186.95:8888`, mantendo ProxySeller para IPv6 US, IPv4 e ISP. Blocos ProxySeller existentes continuam ativos e expiram naturalmente — nenhum cliente atual quebra.

## 1. Secrets (backend)

Adicionar via `add_secret`:
- `FASTPROXY_VPS_API_URL` = `http://104.234.186.95:8888` (trocar para HTTPS quando você apontar o domínio)
- `FASTPROXY_VPS_API_TOKEN` = `***REMOVED***`

## 2. Novo adapter: `src/lib/fastproxy-vps.server.ts`

Cliente HTTP tipado espelhando a API da VPS:
- `createBlock({ size, duration_days, customer_ref })` → `POST /blocks`
- `getBlock(id)` / `listBlocks()` → `GET /blocks[/:id]`
- `renewBlock(id, days)` → `POST /blocks/:id/renew`
- `cancelBlock(id)` → `POST /blocks/:id/cancel`
- `upsertCredential({ username, password, block_id })` → `POST /credentials`
- `suspendCredential(username)` → `DELETE /credentials/:username`
- `rotateCredential(username)` → `POST /credentials/:username/rotate`
- `getAudit()` → `GET /audit`

Todos com `Authorization: Bearer <token>`, timeouts, retry único em 5xx, e erros mapeados para strings amigáveis usadas pelas notificações admin.

## 3. Roteamento por provider no `allocation.server.ts`

Introduzir campo lógico `provider` derivado do produto:
- produto tem novo campo `provider` (`'proxyseller' | 'fastproxy_vps'`) — default `proxyseller`.
- Migração: `ALTER TABLE public.products ADD COLUMN provider text NOT NULL DEFAULT 'proxyseller'`; marcar **apenas** `ipv6-br` (e `ipv6-fb-br` se existir como SKU separado) como `fastproxy_vps` **somente para novos pedidos** (flag lida no momento da alocação, não retroativa).

Nas funções principais:
- `allocateProxiesForOrder` → se `product.provider === 'fastproxy_vps'`, chamar novo `allocateFromVps(order, product)`; caso contrário, fluxo atual ProxySeller.
- `runRenewalSweep` → separar loops por provider; blocos com `provider_order_id` prefixado `vps:` vão pelo adapter VPS.
- `hideOrReleaseProxiesForOrder` e `restoreHiddenProxiesForPaidOrder` → chamar `suspendCredential`/`upsertCredential` na VPS para bloquear/reativar o cliente sem apagar o bloco (mesma regra de "não devolver IP ao estoque" já existente para IPv6).

`provider_orders` ganha `provider text default 'proxyseller'` e aceita IDs no formato `vps:<block_id>` para não colidir com IDs numéricos do ProxySeller.

## 4. Fluxo de compra IPv6 BR (VPS)

Quando Stripe confirma pagamento de um pedido `ipv6-br`:
1. Reaproveitar bloco VPS existente com vaga (mesma lógica `pick_consolidated_stock` já usada), OU
2. `createBlock({ size: 10, duration_days: 30 or 365, customer_ref: order.id })`.
3. Para cada IP retornado, inserir em `proxy_stock` (host/porta/credenciais).
4. Chamar `upsertCredential` com o par `username/password` do cliente e vincular ao bloco.
5. Popular `customer_proxies` como hoje.

Inadimplência: `suspendCredential(username)` (3proxy passa a rejeitar auth). Ao voltar a pagar: `upsertCredential` reativa. Bloco só é `cancelBlock`-ado quando **nenhum** cliente pagante resta nele.

## 5. Healthcheck / reconciliação

`cron.healthcheck.ts` passa a consultar `GET /blocks` da VPS além do ProxySeller e reconcilia `proxy_stock` por `host:port` (mesmo padrão já implementado para ProxySeller). Painel admin ganha seção "Provider: fastproxy-vps" com contagem de blocos, IPs livres, próximos vencimentos, e link para `/audit`.

## 6. Migração/rollout seguro

- Feature flag em `provider_settings`: `fastproxy_vps.enabled` (default `false`). Enquanto `false`, tudo continua indo pro ProxySeller mesmo com produto marcado.
- Ativar via admin quando o smoke test passar.
- Nenhum bloco ProxySeller ativo é tocado. Renovações ProxySeller de `ipv6-br` continuam funcionando até os clientes migrarem naturalmente (ou você forçar em massa depois, fora do escopo desta task).

## 7. Painel admin

Nova rota `/admin/vps` (dentro de `_authenticated.admin.*`):
- Status da VPS (`/health`), lista de blocos, IPs por bloco, vencimentos.
- Botões: renovar bloco, cancelar bloco vazio, rotacionar IP, suspender/reativar credencial.
- Log recente do `/audit`.

## 8. Testes de fumaça

Após deploy, chamar via `stack_modern--invoke-server-function` (ou manualmente no admin):
1. Criar pedido de teste `ipv6-br` → bloco criado na VPS, 10 IPs em stock, credenciais funcionam.
2. Simular inadimplência → auth passa a falhar (curl no proxy retorna 407).
3. Reconciliar pagamento → auth volta a funcionar, IPs iguais.
4. Renewal sweep → bloco estende expiração.
5. Rotação de IP no dashboard do cliente → `rotateCredential`, IP muda, porta preservada.

## Detalhes técnicos

- Todos os novos módulos ficam em `src/lib/*.server.ts` (nunca importar direto de rotas/componentes; usar via `createServerFn`).
- HTTP para a VPS é feito só do server; adicionar `FASTPROXY_VPS_API_URL/TOKEN` como secrets, ler dentro dos handlers.
- HTTPS: enquanto o endpoint for HTTP puro, aceitar mas logar warning; assim que apontar domínio + LE, mudar o secret.
- Schema changes numa única migration com GRANTs padrão.
- Sem quebra de compatibilidade: campos novos têm default; código antigo continua compilando.

## Entregáveis

1. Migration: `products.provider`, `provider_orders.provider`, `provider_settings` flag.
2. `src/lib/fastproxy-vps.server.ts` (adapter).
3. Ajustes em `src/lib/allocation.server.ts` e `cron.healthcheck.ts` para branch por provider.
4. Rota admin `/admin/vps`.
5. Secrets `FASTPROXY_VPS_API_URL` + `FASTPROXY_VPS_API_TOKEN`.
6. Smoke test end-to-end com um pedido real de baixo valor.

Confirma que sigo por esse caminho? Se sim, quer que eu já marque **apenas o SKU `ipv6-br`** como `fastproxy_vps` (deixando `ipv6-fb-br` no ProxySeller por enquanto), ou os dois de uma vez?
