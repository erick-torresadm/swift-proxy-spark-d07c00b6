
# Plano — Hardening contra pentest

Baseado no relatório enviado. Vou tratar cada item com uma correção concreta no código, sem mexer em regras de negócio.

## 1. Rate limit (login/signup/reset/checkout/chat/blog-ingest)
- Criar `src/lib/rate-limit.server.ts` com bucket por **IP + chave (email/user_id/rota)** usando uma tabela nova `public.rate_limit_hits (bucket text, key text, window_start timestamptz, count int, primary key(bucket,key,window_start))` + função SQL `bump_rate_hit(_bucket, _key, _window_seconds, _limit)` (padrão do `bump_blog_ingest_rate` que já existe).
- Aplicar em:
  - `auth` (login, signup, reset) — 5/min por IP e 10/hora por email.
  - `checkout.functions.ts` (create order) — 20/min por user, 60/min por IP.
  - `chat.functions.ts` (send message) — 30/min por user.
  - `/api/public/blog/ingest` — reforçar o já existente.
- Retornar 429 com `Retry-After`.

## 2. CORS refletindo Origin
- Criar `src/lib/cors.server.ts` com **allowlist** fixa: `fastproxy.com.br`, `www.fastproxy.com.br`, `swift-proxy-spark.lovable.app`, `*.lovable.app` (preview), `localhost:8080`.
- Substituir qualquer `Access-Control-Allow-Origin: *` ou eco cru de `Origin` nas rotas `/api/public/*` por `withCors(request, response, ALLOWED)` que só devolve o header se a origem estiver na lista.
- Manter `OPTIONS` retornando 204 com os mesmos headers.

## 3. PII/dado a mais nas respostas
- Auditar todas `createServerFn` e rotas em `/api/public/*` para nunca retornar `password_hash`, `email` de terceiros, `stripe_customer_id`, `provider_credentials`, tokens ou colunas `auth.*`.
- Introduzir helpers `toPublicUser()`, `toPublicOrder()`, `toPublicProxy()` em `src/lib/dto.ts` e trocar os `select('*')` sensíveis por projeções explícitas.
- Alvos principais: `admin-*`, `dashboard.functions.ts`, `notifications.functions.ts`, `chat.functions.ts`.

## 4. JWT na URL e token vivo pós-logout
- Verificar que nenhum link/fetch coloca `access_token` na querystring (buscar `?token=` / `#access_token=` e mover para `Authorization: Bearer`).
- No logout do cliente:
  - `queryClient.cancelQueries(); queryClient.clear(); await supabase.auth.signOut({ scope: 'global' }); navigate('/auth', { replace: true })`.
  - `scope: 'global'` revoga o refresh token em todos os dispositivos.
- Encurtar `access_token` para 1h (já é padrão Supabase) e garantir que o middleware server rejeita tokens expirados (`requireSupabaseAuth` já faz).

## 5. Enumeração de usuário
- Padronizar respostas de `/auth/login`, `/auth/signup` e `/auth/reset` para uma única mensagem: *"Se as credenciais estiverem corretas, você receberá acesso/instruções."*
- Nunca diferenciar "email não existe" de "senha errada" no client — mapear os erros do Supabase para essa mensagem genérica em `src/routes/auth.tsx`.

## 6. Clickjacking + headers de segurança
- Adicionar middleware global em `src/start.ts` (`requestMiddleware`) que injeta em toda resposta:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Content-Security-Policy` moderado (permitindo Stripe, Supabase, Meta Pixel, self).

## 7. SQL Injection e IDOR — varredura
- **SQLi**: buscar qualquer `supabase.rpc` ou concatenação em queries; garantir que tudo usa parâmetros nomeados. Revisar funções em `src/lib/*.server.ts` que aceitam input do usuário (`blog-ingest`, `chat`, `checkout`, `admin-ops`).
- **IDOR**: revisar toda rota que aceita `id` do cliente (order_id, proxy_id, conversation_id, notification_id) e confirmar que o `where` inclui `user_id = auth.uid()` OU que a RLS cobre. Rodar `supabase--linter` e listar tabelas sem policy adequada.
- Adicionar testes em `src/lib/__tests__/security.test.ts`:
  - tentar buscar `order` de outro user → deve falhar.
  - tentar `notifications` de outro user → deve falhar.
  - login com email inexistente vs. senha errada → mesma resposta.
  - rate-limit dispara após N tentativas.
  - `Origin` fora da allowlist não recebe CORS.
  - Resposta de `/auth/me` não contém `password_hash` nem `email` de terceiros.

## Detalhes técnicos
- Migração nova: tabela `rate_limit_hits` + função `bump_rate_hit` (com GRANTs + RLS bloqueando leitura, só service_role).
- Middleware de headers em `src/start.ts` via `requestMiddleware`, sem quebrar o `attachSupabaseAuth` existente.
- CORS helper reutilizável para todas as rotas `/api/public/*` (hooks, stripe-webhook, blog/ingest).
- Rodar `supabase--linter` no fim e executar `bunx vitest run` para validar.

## Entregáveis
1. Migração SQL (rate_limit_hits + função).
2. `src/lib/rate-limit.server.ts`, `src/lib/cors.server.ts`, `src/lib/dto.ts`, `src/lib/security-headers.server.ts`.
3. Ajustes nas rotas/functions listadas acima.
4. Ajuste no logout e nas mensagens de auth.
5. Suite de testes de segurança + relatório final do linter.

Confirma que posso implementar tudo isso?
