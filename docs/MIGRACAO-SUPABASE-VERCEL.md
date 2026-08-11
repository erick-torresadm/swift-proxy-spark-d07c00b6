# Migração para Supabase próprio + deploy fora da Lovable

Projeto de destino: `jmzexqinpyakrtolvsnh` (`https://jmzexqinpyakrtolvsnh.supabase.co`)

## O que já está feito

- Schema (38 tabelas), funções, triggers e RLS no projeto novo
- Dados copiados (pedidos, estoque de proxies, blog, chat, cupons, pacotes, filas)
- 68 contas de Auth recriadas (usuários precisam usar "esqueci minha senha" no 1º login)
- Cron jobs recriados no projeto novo
- Código apontando para o projeto novo:
  - `src/lib/supabase-custom/config.ts` — URL + publishable key
  - `src/lib/supabase-custom/client.ts` — client do navegador
  - `src/lib/supabase-custom/admin.server.ts` — client admin (usa `FP_SUPABASE_SECRET_KEY`)
  - `src/lib/supabase-custom/auth-middleware.ts` — validação de JWT

## O que falta (só você consegue fazer)

### 1. Secret key do projeto novo
Supabase → Project Settings → API Keys → **Secret key** (`sb_secret_...`)
ou a legacy **service_role**.

Salve com o nome **`FP_SUPABASE_SECRET_KEY`**:
- na Lovable: formulário de secrets
- na Vercel: Settings → Environment Variables

Sem ela o servidor não escreve no banco (webhooks Stripe, alocação de proxies,
filas de e-mail, crons).

### 2. Variáveis de ambiente
Use `.env.example` na raiz como checklist — ele lista **todas** as variáveis que o
código lê. Copie os valores dos secrets atuais para a Vercel com os mesmos nomes.

Observação: nenhum valor secreto pode ser lido/exportado automaticamente daqui —
eles ficam num cofre criptografado. Copie um por um do painel de secrets.

### 3. Auth no projeto novo
- Habilitar provedor **Google** (Authentication → Providers)
- Configurar **Site URL** e **Redirect URLs**: `https://www.fastproxy.com.br`,
  `https://fastproxy.com.br` e o domínio de preview da Vercel
- Revisar templates de e-mail de auth

### 4. Stripe
Apontar o webhook para o novo domínio:
`https://SEU-DOMINIO/api/public/stripe-webhook`
(eventos atuais mantidos; o `STRIPE_WEBHOOK_SECRET` muda ao recriar o endpoint)

### 5. Crons
Os cron jobs do banco chamam `/api/public/hooks/*` com o header
`x-cron-secret: $CRON_SECRET`. Atualize a URL base nos jobs do projeto novo para
o domínio da Vercel e **desligue os crons do backend antigo** para não rodar em
dobro.

### 6. Deploy na Vercel
O app é TanStack Start (Vite). Na Vercel:
- Framework preset: **Vite** (build `bun run build`, output do adapter)
- Node/Edge: o preset atual do projeto é edge (`wrangler.jsonc`); ao sair da
  Lovable, remover `wrangler.jsonc` e usar o adapter de Node/Vercel do TanStack
  Start.
