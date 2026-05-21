## Resultado da auditoria contra docs.proxy-seller.com

Validei nosso código contra `/order/calc`, `/order/make`, `/proxy/list`, `/reference/list`, `/balance/get` e testei chamadas reais com a chave de produção. Boa notícia: **a integração base está correta** (URL, auth, modelo de erro, parsing). O problema do "Country not exists" original foi resolvido pela migração. Mas ao olhar os últimos pedidos descobri **3 problemas sérios que estão queimando saldo e impedindo a entrega dos proxies**.

## O que está certo

- Base URL `https://proxy-seller.com/personal/api/v1/{apiKey}/` ✓
- Autenticação por chave no path ✓
- Tratamento de "HTTP 200 com errors[]" ✓
- `paymentId: 1` (saldo) ✓
- `protocol: "HTTPS"` para IPv6 ✓ (obrigatório, confirmado em chamada real)
- `targetSectionId: 8` + `targetId: 1768` para IPv6 ✓ (obrigatório na prática mesmo não estando na doc — confirmei: sem eles retorna `Set existed [targetSectionId] from reference`)
- `countryId: 20554` (Brasil) e `785` (US) ✓ confirmados em `/reference/list/ipv6`
- `periodId: "1m"` ✓
- Mapeamento dos campos de `/proxy/list` para `proxy_stock` (host = `ip_only`, port = `port_http`, login/password) ✓
- `/balance/get`, `/prolong/calc`, `/prolong/make`, `/proxy/replace` chamados conforme docs ✓

## Problemas encontrados

### 1. Corrida entre `/order/make` e `/proxy/list` (crítico)
A doc avisa: *"Order processing, selection, and activation of IPs take anywhere from a few seconds to a minute"*. Nosso código chama `/proxy/list` **imediatamente** após `/order/make`, recebe `items: []` e grava `quantity: 0` no `provider_orders` — os IPs nunca entram no estoque. Confirmei chamando `/proxy/list?orderId=4742245_99186928` agora: os 10 IPs estão lá. Na hora do make, não estavam.

**Evidência no banco:** 5 pedidos provedor criados em segundos (4742245…4742250), todos com `quantity: 0` e payload `baseOrderNumber` salvo. Os IPs existem na ProxySeller mas não no nosso estoque.

### 2. Sem lock/idempotência → cada clique em "Sincronizar" compra de novo (crítico — gasta dinheiro)
Cada clique do cliente em "Sincronizar agora" dispara um `/order/make` novo. Em segundos o saldo caiu de **$10.66 → $1.06** comprando o mesmo lote 5×. Sem cooldown e sem reaproveitar `provider_orders` recentes.

### 3. `audit_log` de chamadas ProxySeller não está sendo gravado
O `void supabaseAdmin.from("audit_log").insert(...)` em `psCall` não persiste no Worker (a Promise é descartada antes do flush). Resultado: ficamos cegos para depurar — não há nenhum log de `proxy_seller` na tabela apesar de dezenas de chamadas.

## Plano de correção

### A. `src/lib/proxyseller.server.ts` — robustecer `/proxy/list` pós-compra

Em `purchaseIpv6Block`, depois do `/order/make`:
- Fazer **polling** de `/proxy/list/ipv6?orderId={baseOrderNumber}` com backoff (ex.: 1s, 2s, 4s, 8s, 15s, 30s — até ~60s no total) até `items.length >= quantity` ou timeout.
- Se timeout, **NÃO** estourar exceção: retornar o `baseOrderNumber` + `proxies: []` e marcar para backfill posterior (status `pending` em `provider_orders`).
- Trocar o `void supabaseAdmin.from("audit_log").insert(...)` por `await` (garante gravação do log).

### B. `src/lib/allocation.server.ts` — lock + reuso de ordens pendentes

Antes de chamar `autoPurchaseIpv6IntoStock`:
1. **Reaproveitar provider_orders recentes** do mesmo `product_id` com `status='pending'` e idade < 2 min: rebuscar `/proxy/list` e tentar popular o estoque. Se conseguir, pular a compra.
2. **Lock por produto**: usar `audit_log` (ou nova tabela `purchase_locks`) com chave única `auto_buy:{product_id}` válida por 90s. Se já houver lock, retornar `short` sem comprar de novo e mostrar mensagem "compra em andamento, aguarde".
3. Só então chamar `purchaseIpv6Block`. Persistir `provider_orders` com `status='pending'` se vier sem IPs, `active` se já tiver.

### C. Novo job de backfill: `src/routes/api/public/hooks/proxyseller-backfill.ts`

Endpoint público chamado por cron a cada 1 min:
- Pega `provider_orders` com `status='pending'` e idade entre 30s e 30 min.
- Para cada um, chama `/proxy/list/ipv6?orderId={baseOrderNumber}`.
- Se vierem IPs: insere em `proxy_stock`, marca order como `active`, dispara `allocateProxiesForOrder` para o pedido do cliente que originou a compra (precisa rastrear `order_id` no `provider_orders` — adicionar coluna).
- Notifica admin: "Estoque renovado: +N IPs".

### D. Migração no banco

```sql
-- Rastrear qual pedido do cliente disparou cada compra de provedor
ALTER TABLE provider_orders ADD COLUMN triggered_by_order_id uuid;

-- Backfill manual dos 5 pedidos órfãos já criados (ipv6-br, baseOrderNumbers conhecidos)
-- Marca como pending para o job pegar
UPDATE provider_orders SET status='pending'
 WHERE external_order_id IN ('4742245','4742247','4742248','4742249','4742250');
```

### E. Mensagem ao cliente

Em `src/routes/_authenticated.dashboard.proxies.tsx`, quando `short > 0` e há `provider_orders` pendente para o produto, mostrar: *"Estamos preparando seus proxies (até 1 min). A página atualiza sozinha."* + auto-refresh a cada 15s em vez do toast de erro.

## Detalhes técnicos

- Polling backoff implementado com `for` simples e `await new Promise(r => setTimeout(r, ms))`.
- Lock idempotente via `INSERT … ON CONFLICT DO NOTHING` em tabela `purchase_locks(product_id PK, locked_until)` ou usando `audit_log` com `dedupe_key`-like unique index.
- O endpoint `/api/public/proxyseller-backfill` precisa de assinatura HMAC ou token simples no header para não ser chamado externamente.
- Após esses fixes, recomendo recarregar o saldo da ProxySeller (está em $1.06) antes de testar de novo.

## Fora de escopo (não muda agora)

- O endpoint `/proxy/replace` (rotação) já está correto conforme docs.
- Catálogo de produtos (`provider_tariff_id`) já está com IDs corretos validados contra `/reference/list/ipv6`.
- IPv4/ISP não estão integrados ainda (sem `provider_tariff_id`) — fora do escopo desta auditoria.
