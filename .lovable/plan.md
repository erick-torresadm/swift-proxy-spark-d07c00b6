
# Painel Admin — KPIs Stripe + Contato com Clientes

Objetivo: deixar o painel admin realmente útil — KPIs vindos do Stripe (não só do banco), lista de inadimplentes com telefone/email, e botões pra disparar email (Resend, que você já tem) e WhatsApp.

## 1. Novo serverFn `getAdminKpis` (lib/admin-kpis.functions.ts)

Roda em paralelo:

- **Stripe** (`src/lib/stripe.server.ts`):
  - `stripe.customers.list({ limit: 100 })` paginado → total de clientes Stripe
  - `stripe.subscriptions.list({ status: 'active', limit: 100 })` paginado → MRR (somando `items.price.unit_amount` * recorrência → normalizado mensal) e total ativos
  - `stripe.subscriptions.list({ status: 'past_due' })` + `status: 'unpaid'` → inadimplentes
  - `stripe.charges.list({ created: { gte: now-30d } })` → receita 30d real (paid - refunded), conta de pagamentos
- **Banco** (mantém o que já existe): clientes cadastrados, proxies ativos, estoque disponível/alocado/alertas.

Retorna um único objeto com tudo. Faz cache em memória de 60s pra não martelar Stripe (módulo simples com Map + TTL).

## 2. Atualizar `_authenticated.admin.index.tsx`

Substitui o grid atual por seções:

```
[ Receita 30d (Stripe) ] [ MRR ]      [ Assinaturas ativas ]
[ Inadimplentes ]        [ Clientes Stripe ] [ Clientes cadastrados ]
[ Proxies ativos ]       [ Estoque disp. ]   [ Alertas estoque ]
```

Inadimplentes vira link → nova rota `/admin/inadimplentes`.

## 3. Nova rota `/admin/inadimplentes` (lista + ações)

ServerFn `listDelinquents`:
- Busca `orders` com `status in ('past_due','grace')` OU `subscriptions` Stripe `past_due/unpaid`
- Junta com `profiles` (nome, telefone) e `auth.users.email`
- Retorna: nome, email, telefone, valor, ciclo, dias em atraso, link Stripe customer

Tabela com colunas: Cliente | Contato | Atraso | Valor | Ações.

Ações por linha:
- **WhatsApp**: link `https://wa.me/55<phone>?text=<msg padrão configurável>` (abre em nova aba)
- **Email**: botão que chama serverFn `sendDunningEmail` (usa Resend já configurado, template "Pagamento pendente" com link do portal Stripe `billing_portal.sessions.create`)
- **Copiar email / telefone**

Mensagem padrão (template editável depois): "Olá {nome}, identificamos que sua assinatura FastProxy está com pagamento pendente desde {data}. Regularize aqui: {portal_url}".

## 4. Aprimorar `/admin/customers`

Adicionar colunas: **Email**, **Status Stripe** (active/past_due/none), **MRR do cliente**. ServerFn `listCustomers` passa a:
- Buscar `auth.users` (admin API) pra email
- Buscar `orders` agregando por user_id pra status/MRR

Botões na linha: WhatsApp + Email (mesma ação do item 3).

## 5. Email transacional (Resend)

Função `sendDunningEmail({ userId, orderId })`:
- Gera Stripe Billing Portal session pra esse customer
- Envia via Resend (template HTML simples, marca FastProxy)
- Loga em `email_send_log` (tabela já usada no projeto)

## 6. Detalhes técnicos

- Arquivos novos:
  - `src/lib/admin-kpis.functions.ts` — getAdminKpis, listDelinquents, sendDunningEmail
  - `src/lib/admin-kpis.server.ts` — helpers Stripe (cache TTL, MRR normalization)
  - `src/routes/_authenticated.admin.inadimplentes.tsx`
- Arquivos editados:
  - `src/routes/_authenticated.admin.index.tsx` (novo grid)
  - `src/routes/_authenticated.admin.customers.index.tsx` (colunas + ações)
  - `src/lib/inventory.functions.ts` (`listCustomers` enriquecido)
- Todos os serverFns usam `requireSupabaseAuth` + `assertAdmin`.
- Sem migrations. Sem mexer em allocation/proxy logic (não foi pedido).

## Perguntas

1. Telefone armazenado em `profiles.phone` — está em formato E.164 (`+5511...`) ou só dígitos? Preciso saber pra montar `wa.me`. Posso assumir BR (+55) quando vier sem prefixo?
2. Template do WhatsApp e do email de cobrança — tem texto que prefere, ou uso um padrão e você ajusta depois?
3. Quer que o botão "Email" abra um modal de pré-visualização antes de enviar, ou envia direto com confirmação?
