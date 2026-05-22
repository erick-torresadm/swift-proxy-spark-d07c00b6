## Resposta curta

**Não precisa instalar mais nenhuma tag.** O snippet `gtag.js` do Google Ads (`AW-18182315422`) que você já adicionou cobre os dois objetivos:

1. **Remarketing** — basta o tag estar carregado no site (já está, em todas as páginas via `__root.tsx`). O Google Ads cria automaticamente a audiência "Todos os visitantes" assim que detectar tráfego. Você só precisa, no painel do Google Ads → Ferramentas → Públicos-alvo, criar listas segmentadas (ex.: "visitou /checkout e não comprou", "visitou /planos").
2. **Conversões** — o tag carrega, mas **não dispara conversão sozinho**. Hoje o site só envia `page_view`. Precisa disparar `gtag('event', 'conversion', { send_to: 'AW-18182315422/<LABEL>' })` nos momentos certos.

O que ainda **falta no código** é disparar esses eventos. É isso que esse plano resolve.

## O que você precisa fazer no Google Ads (fora do código)

Criar 3 ações de conversão em **Google Ads → Metas → Conversões → + Nova ação → Site**:

| Conversão | Categoria | Quando dispara |
|---|---|---|
| `purchase` | Compra | Pagamento confirmado no `/checkout/success` |
| `lead_chat` | Lead enviar formulário | Visitante deixa nome/e-mail/telefone no ChatWidget |
| `sign_up` | Inscrição | Cadastro concluído em `/signup` |

Cada uma vai te dar um **conversion label** (algo como `AbC-D_efGhIjKlMnO`). Me passa os 3 labels (ou eu deixo placeholders `REPLACE_ME_*` no código pra você colar depois).

## O que vou alterar no código (UI/presentation apenas)

### 1. `src/lib/gtag.ts` (novo)
Helper único e tipado pra disparar conversão sem espalhar `window.gtag` pelo projeto:

```ts
const AW_ID = "AW-18182315422";
const LABELS = {
  purchase:  "REPLACE_ME_PURCHASE",
  lead_chat: "REPLACE_ME_LEAD_CHAT",
  sign_up:   "REPLACE_ME_SIGN_UP",
} as const;

export function trackConversion(name: keyof typeof LABELS, params?: {
  value?: number; currency?: string; transaction_id?: string;
}) {
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  if (typeof w.gtag !== "function") return;
  w.gtag("event", "conversion", {
    send_to: `${AW_ID}/${LABELS[name]}`,
    ...params,
  });
}
```

### 2. `src/routes/checkout.success.tsx`
Disparar `trackConversion('purchase', { value, currency: 'BRL', transaction_id: order.id })` dentro de um `useEffect` quando o pedido confirmar — só uma vez por sessão (guard com `sessionStorage` pra evitar duplicar em refresh).

### 3. `src/components/site/ChatWidget.tsx`
Disparar `trackConversion('lead_chat')` no submit do formulário de identificação do guest (quando preenche e-mail/telefone) — também com guard de uma vez por conversa.

### 4. `src/routes/signup.tsx`
Disparar `trackConversion('sign_up')` no `onSuccess` do cadastro.

### 5. (opcional, recomendado) `enhanced_conversions`
Adicionar no `gtag('config', ...)` em `__root.tsx`:
```js
gtag('set', 'user_data', { email_address: <hash>, phone_number: <hash> })
```
Isso melhora muito a taxa de match no Google Ads quando o usuário tem e-mail/telefone (chat e checkout). Eu uso SHA-256 client-side antes de enviar — nenhum dado em texto puro sai do navegador.

## O que NÃO precisa

- ❌ Google Tag Manager (GTM) — você já está usando o gtag direto, que é suficiente. GTM só vale a pena se você for adicionar várias plataformas (Meta, TikTok, etc.) — você disse que é só Google Ads.
- ❌ Meta Pixel, TikTok Pixel — confirmado que não.
- ❌ Server-side tracking (Conversions API) — não necessário pro Google Ads no estágio atual; o gtag client-side resolve.
- ❌ Backend novo / nenhuma alteração no banco.

## Resumo do escopo

5 arquivos tocados (1 novo + 4 edits), tudo frontend/presentation. Zero mudanças de schema, RLS, server functions ou dependências.

Me confirma:
- (a) Sigo com placeholders `REPLACE_ME_*` pros conversion labels, ou você já tem os 3 labels do Google Ads pra eu colar direto?
- (b) Quer que eu inclua o **enhanced conversions** (item 5)?