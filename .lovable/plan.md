## Endpoint público seguro pra ingestão do agente Python

### O que vou criar

**1. Rota TanStack: `POST /api/public/blog/ingest`** (`src/routes/api/public/blog/ingest.ts`)

Camadas de proteção (defesa em profundidade — sem nenhuma o endpoint cai; com as 4 fica praticamente intocável pra ataque casual):

1. **Bearer + HMAC obrigatórios.** Headers exigidos:
   - `Authorization: Bearer <BLOG_INGEST_TOKEN>` — segredo de 64 chars (gerado via `generate_secret`, fica no Lovable Backend, nunca no código). Comparação `timingSafeEqual`.
   - `x-signature: sha256=<hmac>` — HMAC-SHA256 do **corpo cru** usando `BLOG_INGEST_HMAC_SECRET` (outro segredo de 64 chars). Garante que o body não foi alterado em trânsito mesmo se o token vazar em log.
   - `x-timestamp: <unix>` — rejeita request com mais de **5 min de diferença** do `now()` (anti-replay).
   - `x-nonce: <uuid>` — gravado em tabela `blog_ingest_nonces` com TTL 10 min; nonce repetido = 409 (anti-replay duplo).

2. **Rate limit por IP.** Máximo 30 req / 10 min, gravado em `blog_ingest_rate` (key = IP + janela). Excedeu = 429.

3. **Allowlist opcional de IP.** Coluna `BLOG_INGEST_ALLOWED_IPS` (CSV). Se vazia, libera qualquer IP (só você sabe o token). Se preenchida, só esses IPs passam. Você pode adicionar o IP fixo da sua máquina depois.

4. **Validação Zod estrita.** Body limitado a:
   - Máx **20 posts por request**, máx **500 KB de payload total**.
   - `title` 5-200 chars, `body_md` 200-50000 chars, `slug` regex `^[a-z0-9-]+$`, `tags` máx 10, `faq` máx 15.
   - `status` ∈ `["draft","scheduled"]` — **`published` é proibido pelo endpoint** (sua decisão).
   - Se `status="scheduled"` e `publish_at` < `now() + 1h`, força pra `now() + 1h` (janela mínima).
   - Default: `status="scheduled"`, `publish_at = now() + 1h`.

5. **Sanitização markdown.** Já temos `isomorphic-dompurify` no projeto. Renderizo o `body_md` pra HTML server-side e sanitizo antes de qualquer preview; o que salva no banco é só markdown puro (sem `<script>`, sem `javascript:`, sem `on*=`).

6. **Idempotência por slug.** Mesmo `slug` enviado 2x = update do rascunho existente, não duplica. Resposta diz `"action": "created" | "updated" | "skipped"`.

7. **Logs auditáveis.** Cada ingestão grava em `audit_log` (ator: `system:blog-ingest`, IP, qtd posts, source).

### Segredos novos (criados via `generate_secret`, 64 chars cada)

- `BLOG_INGEST_TOKEN` — bearer do agente.
- `BLOG_INGEST_HMAC_SECRET` — chave HMAC.

Você copia ambos do painel Backend → Segredos pra dentro do `.env` do seu script Python. Nunca chegam no bundle do frontend (só rodam no Worker).

### Schema novo (migração)

```sql
-- Anti-replay
CREATE TABLE public.blog_ingest_nonces (
  nonce text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Rate limit
CREATE TABLE public.blog_ingest_rate (
  ip text NOT NULL,
  window_start timestamptz NOT NULL,
  count int NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, window_start)
);
-- ambas com GRANT só pro service_role + RLS bloqueando tudo
-- pg_cron diário limpa registros > 1h
```

### Contrato final do endpoint

```python
# Lado Python — pseudocódigo
import hmac, hashlib, time, uuid, json, httpx

body = json.dumps({"posts": [...]}, separators=(",",":"))
ts = str(int(time.time()))
nonce = str(uuid.uuid4())
sig = "sha256=" + hmac.new(HMAC_SECRET.encode(), (ts + "." + body).encode(), hashlib.sha256).hexdigest()

httpx.post(
  "https://project--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app/api/public/blog/ingest",
  content=body,
  headers={
    "Content-Type": "application/json",
    "Authorization": f"Bearer {BLOG_INGEST_TOKEN}",
    "x-signature": sig,
    "x-timestamp": ts,
    "x-nonce": nonce,
  },
  timeout=30,
)
```

Resposta sempre JSON:
```json
{
  "ok": true,
  "created": [{"id":"uuid","slug":"...","status":"scheduled","publish_at":"...","admin_url":"/admin/blog/posts/uuid"}],
  "updated": [],
  "errors": []
}
```

Erros genéricos (401 / 403 / 429) **não** dizem qual camada falhou — atacante não consegue distinguir "token errado" de "HMAC errado" de "IP bloqueado". Você vê o motivo real só em `audit_log`.

### UI admin (pequeno ajuste)

Adiciono um filtro "Origem: agente" em `/admin/blog/posts` (lendo a coluna `source` que já vou popular). Você abre, revisa, clica publicar. Posts scheduled aparecem com badge "Vai ao ar em 58 min" e botão "Cancelar agendamento".

### Documentação

Crio `docs/BLOG-INGEST.md` com:
- Como gerar os headers (snippet Python pronto pra copiar).
- Schema completo do body.
- Códigos de erro e o que cada um significa.
- Como rotacionar os segredos se vazar.

### Arquivos criados/editados

- `src/routes/api/public/blog/ingest.ts` (novo) — endpoint + verificação HMAC + rate limit
- `src/lib/blog-ingest.server.ts` (novo) — sanitização, idempotência, persistência
- `supabase/migrations/<ts>_blog_ingest.sql` (novo) — tabelas nonce + rate, cleanup cron
- `src/routes/_authenticated.admin.blog.posts.index.tsx` (edit) — filtro "Origem"
- `docs/BLOG-INGEST.md` (novo) — guia pro lado Python
- Segredos: `BLOG_INGEST_TOKEN` e `BLOG_INGEST_HMAC_SECRET` via `generate_secret`

### O que **não** vou fazer

- Não exponho UI pública pra disparar geração (você disse local).
- Não chamo o Ollama do lado Lovable.
- Não permito `status=published` direto (mínimo scheduled +1h).
- Não toco em `posts.functions.ts` que já existe — endpoint usa caminho próprio.
