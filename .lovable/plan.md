## O que já está pronto
- Compra automática de bloco IPv6 quando faltar estoque
- Reuso de IPs liberados de inadimplentes (grace 7 dias)
- Rotação de IP via `/proxy/replace` (cota mensal IPv6 FB)
- Sync diário Stripe + cron de limpeza

## O que dá pra adicionar (ordem de impacto)

---

### 1. Pricing dinâmico em BRL com margem garantida ⭐
**Problema:** preço fixo no Stripe; se ProxySeller subir o USD ou cotação disparar, vendemos no prejuízo.
**Solução:**
- Cron diário chama `/order/calc` por produto → custo real em USD
- Multiplica por cotação USD→BRL (API do BCB, AwesomeAPI ou cache manual no admin) + markup % configurável
- Atualiza Stripe Price automaticamente (cria novo price, marca antigo inativo) ou apenas exibe alerta no admin
- Painel admin mostra: custo USD, cotação, preço de venda, margem %, alerta se margem < limite

### 2. Saldo + alertas ProxySeller ⭐
- Cron horário em `/balance/get`
- Widget no admin: saldo atual, gasto últimos 30d, projeção
- Alerta por email/WhatsApp quando saldo < limite (ex: $50)
- Bloqueia compras automáticas se saldo insuficiente (evita checkout falhar)

### 3. Auto-renovação real (não recompra) ⭐⭐
**Hoje:** quando Stripe renova subscription, alocação cria novos IPs.
**Melhor:** chamar `/prolong/calc` + `/prolong/make` pra **estender os MESMOS IPs** do cliente.
**Ganho:** cliente mantém IPs aquecidos/limpos (crucial pra Facebook Ads), custo de prolongation < compra nova.

### 4. Reabastecimento preventivo (restock_rules) ⭐
Tabela `restock_rules` já existe. Falta o cron:
- Diário: para cada produto IPv6, conta estoque `available`
- Se < `min_stock` e regra `enabled` → compra `batch_quantity` blocos
- Resultado: checkout instantâneo (não espera API externa)

### 5. Catálogo expandido — Mobile / Residential ⭐⭐
ProxySeller vende muito além de IPv4/IPv6:
- **IPv4 Dedicado** (`/order/make/ipv4`) — vendemos hoje mas sem auto-compra
- **ISP residencial** (`/order/make/isp`) — vendemos hoje mas sem auto-compra
- **Mobile 4G** (`/order/make/mobile`) — premium, conta sensível (Insta/TikTok) — novo SKU
- **Residential por tráfego** (`/resident/list/add`) — vende X GB/mês, cria lista com GEO, expõe creds, mostra consumo via `/resident/traffic/details`

Cada um vira novo produto com margem própria.

### 6. Wizard de país + período no checkout ⭐
- Chamar `/reference/list/{type}` ao carregar pricing page
- Cliente escolhe: país (BR/US/UK/DE/…), duração (30/90/180/365 dias)
- Mais duração → desconto progressivo (mostramos economia)
- Sem cadastrar SKU manual no Stripe; geramos price dinâmico ou usamos checkout custom

### 7. Health monitoring de IPs
- Cron diário: `/proxy/list/{type}` cruza com `customer_proxies`
- Detecta: IPs expirando ≤3 dias, IPs com status `Inactive`/`Blocked`
- Notifica cliente + admin; substitui automaticamente IP morto por outro do estoque

### 8. Self-service no painel do cliente
- Botão **"Baixar lista (txt/csv/json)"** → proxy para `/proxy/download/{type}` (servidor monta o arquivo, cliente nunca toca a API)
- Botão **"Renovar agora"** com cálculo via `/prolong/calc` (upsell antes de expirar)
- Botão **"Adicionar comentário"** no IP → `/proxy/comment/set` (cliente organiza por campanha)

### 9. Rotação residencial avançada (produto premium)
`/resident/list/rotation` aceita 3 modos:
- **Sticky** (sessão fixa)
- **Per-request** (IP novo a cada request)
- **Time-based** (1–3600s)
Vira diferencial vs concorrência: mesma assinatura, cliente troca o modo pelo dashboard.

### 10. Whitelist IP (auth sem senha)
Para clientes B2B que querem auth por IP fixo:
- Cliente cadastra IP no painel → enviamos via `order.authorization` ou `/resident/list/add` com whitelist
- Sem user/pass, IPv6 nativo

### 11. Auto-tag de IPs (suporte 10x mais rápido)
- Ao alocar, chamamos `/proxy/comment/set` com `order_id` + email do cliente
- No painel ProxySeller (admin) cada IP já mostra dono → debug instantâneo

### 12. Cota de replace centralizada
Hoje contamos rotações local. A PS tem cota própria por order.
- Buscar cota real via `/proxy/list` (campo de replace remaining) e mostrar no admin
- Evita conflito (cliente acha que tem 10, mas PS bloqueou)

### 13. Subaccounts residencial (agências)
`/resident/subaccount/*` — vender plano "Agência" onde cada cliente final tem subconta isolada (tráfego separado, creds próprias).

---

## Detalhes técnicos (resumido)

**Arquivos novos previstos:**
- `src/lib/proxyseller.server.ts` → expandir com: `getBalance`, `calcOrder`, `prolongCalc`, `prolongMake`, `getReferenceList`, `downloadProxies`, `setComment`, `residentialListAdd`, `residentialTraffic`, `getQuotes` (USD→BRL)
- `src/routes/api/public/hooks/proxyseller-sync.ts` → cron diário (preço dinâmico, restock, health, balance)
- `src/lib/pricing.server.ts` → cálculo custo+markup+BRL, sync com Stripe Price
- UI admin: `/admin/proxyseller` (saldo, gasto, cotação, regras de markup)
- UI cliente: botões download / renovar / rotação residencial / comentar

**Tabelas a adicionar/ajustar:**
- `pricing_rules` (product_id, markup_pct, min_margin_pct, currency)
- `fx_rates` (currency, rate_brl, fetched_at)
- `provider_balance_snapshots` (balance_usd, fetched_at)
- `proxy_health_events` (proxy_id, event, detected_at)
- Coluna `residential_traffic_gb` em `customer_proxies` (pra plano GB)

**Secrets adicionais:** nenhum (mesma `PROXYSELLER_API_KEY`). FX pode usar API pública sem chave.

---

## Sugestão de implementação em fases

**Fase 1 — Sustenta operação atual (1 sprint):**
1, 2, 4, 7 → garante margem, não fica sem estoque, não vende no prejuízo.

**Fase 2 — Retém cliente (1 sprint):**
3, 8, 11 → IPs aquecidos sobrevivem renovação, cliente faz tudo sozinho, suporte rápido.

**Fase 3 — Expande receita (2 sprints):**
5, 6, 9, 10, 13 → novos SKUs (Mobile/Residential), wizard de país, agências.

**Fase 4 — Polimento:**
12 e features menores.

---

## Pergunta antes de implementar
Quer começar pela **Fase 1 inteira** ou priorizar algo específico (ex: só pricing dinâmico BRL + saldo)? Também posso fazer só os SKUs novos (Mobile/Residential) se a prioridade é receita.