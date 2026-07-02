# Aumentar ticket e reduzir churn: bumps, upsells e empurrar o anual

Objetivo: subir AOV (order bumps no checkout) e LTV (forçar/incentivar plano anual + one-click upsell pós-pagamento), sem bloquear quem quer mensal.

## Visão geral do que vamos construir

```text
┌─ Landing (Plans) ──────────────────────────────────────────┐
│  Toggle padrão = ANUAL selecionado + badge "Mais escolhido"│
│  Card anual: "2 meses grátis", bônus exclusivos listados   │
│  Card mensal: contador de "economia perdida R$X/ano"       │
└─────────────────┬──────────────────────────────────────────┘
                  ▼
┌─ /checkout ────────────────────────────────────────────────┐
│  Passo 3 (ciclo) reforçado:                                │
│    • Card ANUAL destacado + "-17,5% • 2 meses grátis"      │
│    • Se mensal: barra de escassez com timer 15min          │
│      "Trave o desconto anual • expira em 14:59"            │
│                                                             │
│  NOVO Passo 6 — Order bumps (checkboxes):                  │
│    ☐ +6 meses no mesmo plano por R$X (30% off)             │
│    ☐ +3 proxies extras por R$X (20% off no adicional)      │
│    ☐ Suporte Prioritário VIP — R$19/mês                    │
│    ☐ Setup assistido 1:1 (one-time R$97)                   │
│                                                             │
│  Resumo mostra cada bump separado.                         │
└─────────────────┬──────────────────────────────────────────┘
                  ▼
       Stripe Checkout (line_items = plano + bumps)
                  ▼
┌─ /checkout/success (com upsell one-click) ─────────────────┐
│  Só se comprou MENSAL:                                     │
│    "Upgrade pra anual agora e ganhe MAIS 1 mês grátis"     │
│    Timer 10min • botão "Fazer upgrade (1 clique)"          │
│    → cria nova sessão Stripe usando cartão salvo do        │
│       customer (setup_future_usage já feito no 1º pgto)    │
│  Botão secundário: "Continuar pro dashboard"               │
└────────────────────────────────────────────────────────────┘
```

## Escopo por área

### 1. Landing (`src/components/site/Plans.tsx`)
- Toggle já inicia em `yearly` (ok). Adicionar badge **"Mais escolhido"** no toggle anual.
- No card ativo com billing mensal: mostrar callout **"Você deixa de economizar R$X/ano"** com CTA "Trocar pra anual".
- Adicionar lista de **bônus exclusivos do anual** (só aparece em `billing === "yearly"`):
  - Suporte prioritário incluso
  - +10% de IPs bônus
  - Garantia estendida 60 dias
  - Trava de preço por 12 meses

### 2. Checkout — reforço do anual (`src/routes/checkout.tsx`)
- Passo 3 vira 2 cards grandes (não pills):
  - **ANUAL** destacado com borda primary, badge "ECONOMIZE 2 MESES", lista de 4 bônus.
  - **MENSAL** neutro, com nota discreta "sem bônus • preço reajustável".
- Se usuário selecionar mensal: aparece **barra de escassez** no topo do card com timer de 15min (persistido em `sessionStorage`): *"Trave o desconto anual • expira em MM:SS"*. Ao expirar, some (não bloqueia compra).
- Ao trocar pra anual, timer some e barra vira verde "Desconto travado ✓".

### 3. Checkout — Order bumps (novo passo)
Novo Passo 6 com 4 checkboxes. Estado local `bumps: { extendYear, extraProxies, vipSupport, setupAssist }`.

Bumps disponíveis (config em `src/lib/order-bumps.ts`):

| Bump | Preço | Tipo | Como entra no Stripe |
|---|---|---|---|
| Estender +6 meses (mesmo plano, mesmos IPs) | 6 × mensal × 0.70 | one-time | line_item `mode:payment` extra — só disponível quando billing=monthly |
| +3 proxies extras (mesmo produto) | 3 × unit × 0.80 | recurring | soma na `quantity` do line_item principal com nota no resumo |
| Suporte VIP | R$19/mês | recurring add-on | 2º line_item recurring |
| Setup assistido 1:1 | R$97 | one-time | line_item one-time |

Restrição do Stripe: um mesmo Checkout Session só aceita ou `mode: "subscription"` (com line_items recorrentes; one-time só via `add_invoice_items`) ou `mode: "payment"`. Vamos usar `mode: "subscription"` + `subscription_data.add_invoice_items` pros bumps one-time (setup + extensão). Isso cobra tudo na 1ª fatura.

### 4. Backend — `createCheckoutSession` (`src/lib/checkout.functions.ts`)
- Schema aceita `bumps: { extendMonths?: number; extraProxies?: number; vipSupport?: boolean; setupAssist?: boolean }`.
- Calcula preços dos bumps no servidor (nunca confiar no cliente) usando o mesmo `product.price_monthly_cents`.
- Monta `line_items` + `subscription_data.add_invoice_items` conforme tabela acima.
- Grava bumps em `orders.metadata` (JSONB) e no `subscription.metadata` pro webhook.

### 5. One-click upsell pós-pagamento
- Nova server fn `createAnnualUpgradeSession` em `src/lib/upsell.functions.ts`:
  - Recebe `orderId`. Valida que a order é `paid` + `billing_cycle=monthly` + `< 30min atrás`.
  - Busca customer no Stripe, cria nova Checkout Session anual com cupom especial **`UPGRADE1MES`** (1 mês grátis, gerado on-the-fly como `stripe.coupons.create`).
  - Se sucesso, marca `orders.upsell_taken = true` e cancela a assinatura mensal antiga imediatamente (proração já feita pelo Stripe).
- Componente `<AnnualUpsell orderId>` em `src/routes/checkout.success.tsx`:
  - Só renderiza se `billing_cycle=monthly`.
  - Timer 10min, headline "🔥 Última chance: upgrade pra anual e ganhe +1 mês grátis".
  - Botão grande "Fazer upgrade (1 clique)" → chama server fn → redireciona pro Stripe.
  - Link discreto "Continuar sem upgrade → dashboard".

### 6. Migração de schema
Nova migration `add_order_bumps_and_upsell.sql`:
- `orders.bumps jsonb default '{}'::jsonb`
- `orders.upsell_offered_at timestamptz`
- `orders.upsell_taken boolean default false`
- `orders.upsell_order_id uuid references orders(id)`
- Sem mudança de RLS/policies (herda das existentes).

### 7. Webhook Stripe (`src/lib/stripe-webhook.server.ts`)
- Ao processar `checkout.session.completed`, ler `metadata.bumps` e:
  - Se `extraProxies` → aumentar `orders.quantity` pra bater com o que foi cobrado.
  - Se `vipSupport` → gravar flag `orders.vip_support = true` (nova coluna bool na migration).
  - Alocação de proxies (`allocation.server.ts`) já usa `quantity`, então funciona automático.

## Métricas pra medir sucesso
Adicionar cards no admin overview:
- **Take rate por bump** (últimos 30d)
- **Upsell mensal→anual take rate**
- **AOV com bump vs sem bump**
- **% novos assinantes escolhendo anual** (hoje vs meta)

Ficam em `src/lib/admin-kpis.functions.ts` como novo bloco `orderBumpMetrics`.

## Ordem de implementação (1 PR só)
1. Migration (schema)
2. `order-bumps.ts` (config + cálculo)
3. Backend `checkout.functions.ts` (aceitar bumps)
4. Backend `upsell.functions.ts` (nova fn)
5. UI Plans (toggle padrão anual reforçado)
6. UI Checkout (passo 3 reforçado + timer + passo 6 bumps)
7. UI success page (AnnualUpsell)
8. Webhook (processar bumps)
9. KPIs admin (métricas)

## O que NÃO vou mudar
- Preços atuais dos planos (só oferecemos desconto adicional em bumps/upsell).
- Fluxo de auth/allocation existente.
- Estrutura de coupons — só criamos `UPGRADE1MES` on-the-fly no Stripe.
- Não bloqueio a compra mensal em nenhum lugar.

Posso seguir e implementar?
