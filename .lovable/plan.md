## Objetivo

Testar end-to-end (checkout pago → reconcile → allocation → compra ProxySeller → backfill → proxy entregue) de cada um dos 5 produtos do catálogo, usando `dry_run=true` pra não gastar saldo. Cobrir BR e US separados (sem cross-country) e identificar gaps de implementação.

## Escopo por produto

**Grupo A — fluxo completo (IPv6 BR, IPv6 US, IPv6_FB BR):**
Testa todas as etapas, incluindo compra simulada na ProxySeller via dry-run.

**Grupo B — fluxo parcial (IPv4 US, ISP US):**
Hoje **não têm `provider_tariff_id` configurado** e o restock cron só roda pra `category startsWith "ipv6"`. Vou testar só o que funciona:
1. Allocation com estoque pré-existente → entrega o proxy.
2. Allocation sem estoque → confirmar comportamento atual (retorna `short`, não compra). Reportar como gap.

Se você quiser, depois do teste eu proponho um plano separado pra estender auto-purchase/restock pra IPv4 e ISP.

## Passos

1. **Diagnóstico inicial (read-only)**
   - Estoque (`proxy_stock` available/allocated) por produto.
   - `provider_orders` pending nos últimos 60min.
   - `restock_rules` ativas pra cada produto.
   - `purchase_locks` em aberto.
   - Saldo ProxySeller (snapshot).

2. **Ligar dry-run**
   `UPDATE provider_settings SET dry_run=true WHERE provider='proxyseller'`.

3. **Garantir condições de teste**
   - Para os 3 IPv6: marcar temporariamente todo o estoque `available` como `allocated` (anotar IDs pra reverter), forçando o caminho de compra nova.
   - Para IPv4 US e ISP US: criar **1 IP fake** em `proxy_stock` (status `available`) pra o teste A do grupo B; manter um segundo cenário sem estoque pro teste B.

4. **Criar pedidos sintéticos pagos**
   - 5 pedidos `paid` em `orders` (um por produto), `user_id` = admin/teste, `quantity=1`, `customer_email='e2e-test@…'`, sem `stripe_checkout_session_id`.
   - +2 pedidos extras pra grupo B sem estoque (IPv4 e ISP), pra observar o `short`.

5. **Disparar allocation**
   - Para cada pedido, chamar `allocateProxiesForOrder(orderId)` via server function admin (ou direto via script `code--exec` rodando contra o banco).
   - Esperado grupo A: cria `provider_orders` pending dry-run com `simulateReadyAt` em 3–5min, retorna `pending=true`.
   - Esperado grupo B (com estoque): aloca direto, `customer_proxies.active`.
   - Esperado grupo B (sem estoque): `short>0`, `pending=false`, **nenhuma compra disparada**.

6. **Validar invariantes pós-allocation**
   - Exatamente 1 `provider_orders` pending por produto IPv6 (guard contra duplicate buy).
   - Rodar allocation 2x no mesmo pedido → não duplica.
   - Nenhuma chamada real à ProxySeller (audit_log limpo de `purchaseIpv6Block` real; só `calcOrder`).
   - Notificações "Estoque insuficiente" disparadas pros IPv6.

7. **Aguardar ~5min e rodar backfill**
   - Sleep até passar do maior `simulateReadyAt`.
   - Chamar `POST /api/public/hooks/proxyseller-backfill`.
   - Esperado: `generateSimulatedProxies` cria IPs fake → entram em `proxy_stock` com o `country_code` correto → provider_order vira `active` → allocation do pedido que disparou completa, `customer_proxies.active` aparece.

8. **Validar resultado final dos IPv6**
   - 1 `customer_proxies.active` por pedido.
   - IP do país correto (sem BR↔US trocado).
   - Sem compras duplicadas (1 provider_order por pedido).
   - `audit_log` e `notifications` coerentes.

9. **Rodar restock cron manualmente**
   - `POST /api/public/hooks/proxyseller-sync`.
   - Esperado:
     - IPv6: como já existe pending recente OU já tem ≥10 disponíveis pós-backfill, **não** compra de novo.
     - IPv4/ISP: o cron pula (filtro `startsWith("ipv6")`) — registrar como gap.

10. **Cleanup**
    - Deletar `customer_proxies`, `proxy_stock` fakes, `provider_orders` dryRun, `orders` sintéticos, IPs fake do grupo B.
    - Reverter estoque IPv6 do passo 3 pra `available`.
    - `UPDATE provider_settings SET dry_run=false`.

## Saída pra você

Relatório com:
- Tabela "antes/depois" de estoque por produto.
- Linha do tempo dos `provider_orders` (criado / simulateReadyAt / backfillado).
- Tabela de invariantes por produto (✅/❌):
  1. dry-run: zero chamada real de compra.
  2. zero duplicate buy.
  3. zero cross-country.
  4. cliente recebeu proxy.
- Gaps confirmados:
  - IPv4 US e ISP US sem auto-purchase nem restock.
  - Qualquer outro bug encontrado, com proposta de fix.

## Detalhes técnicos

- Dry-run ainda chama `calcOrder` real (network, não dinheiro).
- `PENDING_REUSE_MAX_AGE_MS=20min`: manter o teste dentro dessa janela.
- Vou precisar de um `user_id` admin pra usar nos pedidos sintéticos — uso o seu (`ericktorresadm@hotmail.com`) ou prefere outro?
- Cleanup é DELETE, então vou agrupar tudo numa única migration no final (a tool de insert não faz delete).

## Riscos

- Se algum invariante falhar, paro o teste, reporto e proponho fix antes de seguir.
- Backfill route depende do `simulateReadyAt`; se eu precisar acelerar, posso reescrever o `simulateReadyAt` pra `now()` no banco em vez de esperar 5min de verdade (mais rápido pro teste, mesmo resultado funcional).
