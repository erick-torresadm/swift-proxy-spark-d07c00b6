# Públicos recomendados para FastProxy (Meta Ads)

Nota: isso é estratégia de mídia, não mudança de código. O Pixel `1916111822410804` e o CAPI já estão rastreando `PageView`, `ViewContent`, `InitiateCheckout` e `Purchase` (com dedupe). Use `test_event_code=TEST12152` no Events Manager → Test Events para validar.

## 1. Públicos personalizados (Custom Audiences) — criar primeiro

Crie no Events Manager → Públicos:

- **Visitantes do site (180 dias)** — todos do Pixel
- **ViewContent 30/60/90 dias** — interessados quentes
- **InitiateCheckout 30/60/90 dias** — alta intenção, não compraram (excluir Purchase)
- **Compradores 180 dias** — base para Lookalike e exclusão em prospecção
- **Lista de clientes (CSV)** — exportar e-mails/telefones do banco e subir (hash automático)

## 2. Lookalikes (LAL) — escalar

A partir das custom audiences acima, no Brasil:

- LAL 1% de **Compradores** (melhor sinal — priorizar quando tiver 100+ compradores)
- LAL 1% de **InitiateCheckout**
- LAL 1-3% de **ViewContent 90d** (volume enquanto a base de compra é pequena)

## 3. Prospecção fria (Direcionamento detalhado)

Idade **22–55**, todos os gêneros, Brasil. Interesses/comportamentos sugeridos (testar em ad sets separados):

**Tech / proxy / dev**
- Desenvolvimento web, Python (linguagem), Web scraping, API, GitHub, Stack Overflow, Linux, VPN, Cibersegurança

**Marketing digital / automação**
- Marketing de afiliados, Tráfego pago, SEO, Growth hacking, Dropshipping, E-commerce, Shopify, Mercado Livre

**Crypto / trading / sneakers (casos de uso comuns de proxy)**
- Criptomoeda, Bitcoin, Binance, Day trading, Sneakers, Hype

**Social media managers / bots**
- Instagram marketing, TikTok marketing, Gestão de redes sociais, Automação

**Cargos (B2B)**
- Desenvolvedor de software, Engenheiro de dados, Analista de marketing, Growth, SEO specialist, Afiliado

## 4. Estrutura de campanha recomendada

```text
Campanha PURCHASE (CBO ou Advantage+)
├── Ad set: Retargeting quente
│    público: IC 30d + VC 30d, EXCLUI Compradores 180d
├── Ad set: LAL 1% Compradores BR
│    EXCLUI Visitantes 30d
├── Ad set: LAL 1% IC BR
│    EXCLUI Visitantes 30d
├── Ad set: Interesses tech/dev BR
└── Ad set: Interesses marketing/afiliados BR
```

Otimização: **Compra** (com CAPI ativo, o sinal é forte mesmo com pouco volume). Atribuição padrão 7d-click / 1d-view.

## 5. Exclusões obrigatórias em prospecção
- Compradores 180d
- Visitantes 30d (em LAL, para não canibalizar retarget)

## 6. Sobre os campos da tela atual

- **Idade 18–50** sugerida pelo Meta → ajuste para **22–55** (público B2B/tech compra mais nessa faixa).
- **Gênero**: manter todos.
- **Direcionamento detalhado**: NÃO deixar aberto no início; use 1–2 interesses por ad set para o algoritmo aprender. Depois de 50 compras/semana, pode testar Advantage+ sem interesses.

## Próximo passo
Quer que eu crie um endpoint server-side para exportar a lista de clientes (CSV com e-mail + telefone hasheados em SHA-256) pronta para subir como Custom Audience no Meta?
