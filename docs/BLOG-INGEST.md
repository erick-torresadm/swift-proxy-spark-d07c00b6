# Blog Ingest API

Endpoint público para o agente Python (Ollama + SEO) publicar posts no blog
FastProxy de forma automática e segura.

## Endpoint

```
POST https://project--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app/api/public/blog/ingest
```

(produção custom domain também funciona: `https://www.fastproxy.com.br/api/public/blog/ingest`)

## Segurança — 4 camadas

1. **Bearer token** (`Authorization: Bearer <BLOG_INGEST_TOKEN>`)
2. **HMAC-SHA256** do corpo (`x-signature: sha256=<hex>`) com chave `BLOG_INGEST_HMAC_SECRET`
3. **Timestamp** (`x-timestamp: <unix>`) — request com mais de 5 min é rejeitado
4. **Nonce único** (`x-nonce: <uuid>`) — gravado no banco; replay = 409

Allowlist opcional de IP via `BLOG_INGEST_ALLOWED_IPS` (CSV) na lista de segredos.

Rate limit: **30 requests / 10 min por IP** → 429.

## Cliente Python pronto

```python
import hmac, hashlib, json, time, uuid, httpx, os

URL = "https://project--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app/api/public/blog/ingest"
TOKEN = os.environ["BLOG_INGEST_TOKEN"]
HMAC_SECRET = os.environ["BLOG_INGEST_HMAC_SECRET"]

def ingest(posts: list[dict]) -> dict:
    body = json.dumps({"posts": posts}, separators=(",", ":"), ensure_ascii=False)
    ts = str(int(time.time()))
    nonce = str(uuid.uuid4())
    sig = "sha256=" + hmac.new(
        HMAC_SECRET.encode(), f"{ts}.{body}".encode("utf-8"), hashlib.sha256
    ).hexdigest()
    r = httpx.post(
        URL,
        content=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TOKEN}",
            "x-signature": sig,
            "x-timestamp": ts,
            "x-nonce": nonce,
        },
        timeout=60,
    )
    r.raise_for_status()
    return r.json()
```

## Schema do body

```json
{
  "posts": [
    {
      "title": "Como comprar proxy IPv6 em 2026",          // obrigatório (5-200 chars)
      "slug": "como-comprar-proxy-ipv6-2026",              // opcional (gera do título)
      "excerpt": "Guia rápido...",                          // opcional (≤500)
      "body_md": "## Intro\n\nMarkdown puro...",           // obrigatório (200-50000)
      "cover_image_url": "https://...",                     // opcional
      "category_slug": "guias",                             // opcional (deve existir)
      "tags": ["proxy", "ipv6"],                            // opcional, até 10
      "seo_title": "Como comprar proxy IPv6 | FastProxy",   // ≤70
      "meta_description": "...",                            // ≤180
      "keyword_primary": "proxy ipv6",
      "keywords_secondary": ["comprar proxy", "ipv6 br"],
      "faq": [{ "question": "...", "answer": "..." }],     // até 15
      "status": "scheduled",                                // "draft" | "scheduled"
      "publish_at": "2026-07-01T10:00:00Z",                // ISO; mínimo now+1h
      "source": "ollama-agent-v1",                          // identificador da origem
      "display_author_name": "FastProxy",                   // default
      "noindex": false
    }
  ]
}
```

Limites:
- até **20 posts por request**
- corpo total ≤ **500 KB**
- `body_md` é Markdown puro; HTML perigoso (`<script>`, `<iframe>`, `javascript:`, `on*=`) é rejeitado.

## Status / publicação

- `draft` → fica em rascunho até você publicar no `/admin/blog`.
- `scheduled` → vira `draft` com `auto_publish_at` no futuro. Um cron roda
  a cada 5 minutos e promove pra `published` quando chega a hora.
- `status="published"` direto é **proibido** — janela mínima de 1h.

Posts já publicados não são sobrescritos pelo endpoint (resposta `error`).
Mesmo `slug` reenviado em rascunho/agendado = **update** (idempotente).

## Resposta

```json
{
  "ok": true,
  "created": [
    {
      "action": "created",
      "id": "uuid",
      "slug": "...",
      "status": "scheduled",
      "publish_at": "2026-07-01T10:00:00Z",
      "admin_url": "/admin/blog/posts/uuid"
    }
  ],
  "updated": [],
  "errors": []
}
```

## Códigos de erro

| Código | Significado |
|--------|-------------|
| 400 | Body inválido (Zod) |
| 401 | Bearer, HMAC, timestamp ou nonce inválido (mensagem genérica de propósito) |
| 403 | IP fora da allowlist |
| 409 | Replay (nonce duplicado) |
| 413 | Payload > 500 KB |
| 429 | Rate limit estourado |
| 503 | Segredos não configurados no backend |

## Rotação de segredos

Se suspeitar de vazamento, no painel **Backend → Segredos**:
1. Atualize `BLOG_INGEST_TOKEN` e `BLOG_INGEST_HMAC_SECRET` (gerar novos 64 chars).
2. Atualize o `.env` do agente Python com os novos valores.
3. Republique o app Lovable.
