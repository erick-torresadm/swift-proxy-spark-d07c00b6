# Painel admin com dados reais do Stripe — tempo real

## O que você vai ver

Uma nova página **`/admin/stripe`** mostrando, ao vivo, tudo que acontece na sua conta Stripe — sem precisar abrir o dashboard deles.

### Cards de KPI (período: hoje / 7d / 30d, com seletor)
- **Receita líquida** — somatório de pagamentos confirmados
- **MRR** (receita recorrente mensal) — soma de assinaturas ativas normalizadas para mês
- **Assinaturas ativas** / **trial** / **past_due** / **canceladas no período**
- **Churn %** (no período)
- **Ticket médio**
- **Reembolsos** (qtd + valor)
- **Disputas/chargebacks** abertos (qtd + valor)
- **Saldo Stripe disponível** + **a caminho** (payout pendente)
- **Cupons** mais usados no período

### Feed "Tudo que acontece" (tempo real)
Lista cronológica das últimas 50 atividades, com filtro por tipo e badge colorida:
- ✅ Venda nova (`checkout.session.completed`)
- 🔁 Renovação paga (`invoice.payment_succeeded` recorrente)
- ⚠️ Falha de pagamento (`invoice.payment_failed`)
- 💸 Reembolso (`charge.refunded`)
- ⛔ Cancelamento (`customer.subscription.deleted`)
- 🚨 Disputa aberta (`charge.dispute.created`)
- 🔄 Plano alterado (`customer.subscription.updated`)
- 🧾 Recibo emitido

Cada item: data/hora, cliente (e-mail), produto, valor, link pro pedido interno + link "Ver no Stripe".

### Tabela de pedidos enriquecida
Na tabela admin já existente: colunas novas com **última fatura**, **próxima cobrança**, **método de pagamento** (Visa •••• 4242), **link direto pra fatura/recibo no Stripe**.

## Como funciona (parte técnica)

### 1. Tabela nova `stripe_events`
Migration cria:
```
stripe_events (
  id text PK,              -- evt_xxx (idempotência)
  type text,
  created_at timestamptz,
  customer_email text,
  amount_cents int,
  currency text,
  order_id uuid,
  subscription_id text,
  invoice_id text,
  charge_id text,
  raw jsonb,
  processed_at timestamptz
)
```
+ RLS (só admin lê via `is_staff`), GRANTs, índice por `created_at desc` e por `type`.
+ Realtime habilitado nessa tabela (`ALTER PUBLICATION supabase_realtime ADD TABLE`).

### 2. Webhook ampliado (`src/lib/stripe-webhook.server.ts`)
Adiciono handlers que faltam:
- `charge.refunded` → grava evento + notifica admin + marca order
- `charge.dispute.created` / `dispute.closed` → notifica admin (alta prioridade)
- `customer.subscription.updated` → detecta troca de plano, upgrade/downgrade
- `customer.subscription.trial_will_end` → aviso 3 dias antes
- `invoice.upcoming` → próxima cobrança
- `payment_intent.succeeded` / `payment_intent.payment_failed` → cobre pagamentos avulsos (futuro EFI/pix one-off via Stripe também)

Todo evento processado é **gravado em `stripe_events`** (upsert por `id` → idempotente) e dispara `notifyAllAdmins` quando relevante.

### 3. Server functions novas (`src/lib/admin-stripe.functions.ts`)
- `getStripeKpis({ period })` — usa Stripe API: `balance.retrieve`, `subscriptions.list`, `charges.list`, `refunds.list`, `disputes.list`, agregando localmente. Cache de 60s em memória pra não estourar rate-limit.
- `listStripeEvents({ limit, type })` — lê `stripe_events` da nossa base (rápido).
- `getStripeMrr()` — soma de `subscriptions` ativas, normalizando ciclos (anual / 12, semestral / 6).
- `syncStripeBackfill()` — botão "Sincronizar últimos 90 dias" que puxa eventos via `stripe.events.list` pra preencher histórico inicial.

Todas com `requireSupabaseAuth` + checagem `has_role(admin)`.

### 4. Página `/admin/stripe`
- Loader prima KPIs e feed
- `useQuery` com `refetchInterval: 30000`
- **Realtime channel** assinando `stripe_events` → quando chega um INSERT, faz `queryClient.invalidateQueries(['admin-stripe'])` → painel atualiza sozinho
- Push notification via VAPID já está pronto no projeto, então admin recebe no celular/desktop mesmo com aba fechada

### 5. Link no menu admin
Adiciono "Stripe" no nav admin entre "Pedidos" e "Cupons", com badge mostrando eventos não lidos das últimas 24h.

## Arquivos tocados
- `supabase/migrations/<novo>.sql` — tabela `stripe_events` + RLS + realtime
- `src/lib/stripe-webhook.server.ts` — novos eventos + gravação em `stripe_events`
- `src/lib/admin-stripe.functions.ts` — **novo**
- `src/routes/_authenticated.admin.stripe.tsx` — **novo**
- `src/components/admin/StripeEventFeed.tsx` — **novo**
- `src/components/admin/StripeKpiCards.tsx` — **novo**
- nav admin existente (1 link)

## Fora do escopo (faço depois se pedir)
- Gráficos históricos (linha de receita por dia) — começa com cards e feed, gráfico vem na v2
- Painel do cliente — você pediu só o admin agora
- Conexão com EFI — fica em standby como combinado
