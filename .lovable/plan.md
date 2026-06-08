# Auditoria FastProxy — o que eu melhoraria

Olhei a home (Hero, Stats, Marquee, Solution, VideoShowcase, Features, InstallGuide, Plans, FAQ, CTA, Footer), Navbar, checkout e rotas públicas. Abaixo o que mais teria impacto, em ordem de prioridade. Você escolhe o que entra no próximo turno (posso fazer tudo ou em fatias).

## 1. Conversão & confiança (impacto alto)

- **Prova social real na home.** Hoje o Stats mostra "50K+ proxies, 500+ clientes, 4.9★ com 237 reviews" hard-coded e sem rosto. Criar uma seção `Testimonials` com 4–6 depoimentos (foto, nome, caso de uso: tráfego pago, automação, scraping) + logos de clientes/ferramentas (GoLogin, Multilogin, Dolphin, AdsPower, Scrapy). Sem isso, o "4.9★" parece inventado.
- **Comparativo visual no Plans.** Hoje os 4 cards são paralelos e o usuário precisa adivinhar qual é o dele. Adicionar:
  - Linha "Melhor para: tráfego pago / automação / scraping / multi-contas" já presente, mas **destacar com ícone de plataforma** (Facebook, Instagram, Google).
  - Tabela comparativa abaixo dos cards (IPv6 × IPv4 × ISP × FB Ads) com colunas: tipo, ideal para, velocidade, preço.
- **CTA secundário do Hero está fraco.** "Ver benefícios" não converte. Trocar por **"Falar no WhatsApp"** ou **"Testar grátis por 24h"** (se a regra permitir teste). Quem não compra na hora vai embora.
- **Garantia explícita.** Não existe selo de "garantia de 7 dias / reembolso". Adicionar selo no Hero, no card de plano e na CTA final. Reduz fricção em primeira compra.

## 2. Hero (primeira tela)

- Está bonito mas **muito centralizado e genérico**. Sugiro layout assimétrico: copy à esquerda, **dashboard real / mockup do painel à direita** (com proxies, copy IP:porta, status verde). O `TerminalMock` atual fica abaixo como detalhe técnico.
- Reduzir o título de 3 linhas para 2 — em mobile ocupa a tela inteira antes do CTA aparecer.
- Adicionar **logos pequenos** logo abaixo do CTA: "Usado por equipes de…" (mesmo que sejam categorias: agências, afiliados, e-commerces).

## 3. SEO & rotas

- **Rotas faltando para conteúdo dedicado.** Hoje "/#planos", "/#beneficios", "/#faq" são âncoras. Para SEO e tráfego pago dedicado, criar:
  - `/proxy-ipv6`, `/proxy-ipv4`, `/proxy-isp`, `/proxy-facebook-ads` — cada um com H1 próprio, casos de uso, FAQ específica, JSON-LD Product e CTA direto pro checkout.
  - `/comparativo` — IPv6 vs IPv4 vs ISP.
  - `/sobre` e `/contato` — institucionais (faltam no Footer também).
- **og:image dinâmico**. As páginas usam só metadados de texto; não há imagem de compartilhamento. Gerar `/og-default.png` e setar em `__root.tsx`; nas páginas de produto sobrescrever com imagem do produto.
- **Schema review faltando.** Já tem `AggregateRating` no Product, mas não há `Review` individual — Google só mostra estrelas com reviews reais marcadas.
- **Idioma**: o site já tem i18n, mas faltam tags `<link rel="alternate" hreflang>`. Importante se você roda anúncios pra EUA.

## 4. Performance

- **`logo-fastproxy.png` no `src/assets/`** — está bundlado no JS. Migrar pra Lovable Assets (CDN). Ganho ~30–80KB por bundle.
- **Aurora + 2 blobs animados no Hero** rodam em loop infinito (12s/15s) com `blur-[120px]`. Em mobile é caro. Reduzir para 1 blob ou pausar via `prefers-reduced-motion`.
- **`framer-motion` em quase todo componente.** Já é pesado. Trocar animações simples por CSS (`@keyframes` + `tailwindcss-animate`) onde não há gestos. Reduz JS inicial.
- **Lazy-load do `VideoShowcase`**. O vídeo de 4.8MB começa a baixar mesmo se o usuário não rolar até lá. Carregar só quando entrar no viewport (`IntersectionObserver` + `preload="none"`).

## 5. UX / detalhes

- **Navbar mobile** não mostra o botão de comprar — só Login/Cadastro. Adicionar **"Comprar"** com destaque no menu mobile.
- **FAQ** poderia ter um campo de **busca** + categorias (Pagamento, Técnico, Conta). 6 perguntas hoje, vai crescer.
- **Cookie banner e Chat widget** — verificar se estão presentes em todas as páginas e se respeitam o `prefers-reduced-motion`.
- **Footer sem redes sociais nem contato direto.** Adicionar: WhatsApp, Telegram, Instagram, e-mail de suporte. Aumenta confiança.
- **Botão flutuante de WhatsApp** no mobile (canto inferior direito) — padrão Brasil, eleva conversão muito.

## 6. Checkout & pós-venda

- Mostrar **3 selos de confiança** logo acima do botão pagar (SSL, cobrança recorrente segura, garantia 7 dias).
- **Upsell discreto** no checkout: "Adicionar 10 proxies por +R$ X" antes do pagamento.
- E-mail de boas-vindas pós-compra com **guia rápido de uso** (já existe o `InstallGuide` na home — replicar no e-mail).

## 7. Dark / Light mode

O `ThemeToggle` existe mas:
- O logo aplica `brightness-0 dark:brightness-100`, ou seja, em light mode fica preto chapado e em dark fica colorido — invertido. Verificar se a versão light está realmente legível.
- Algumas seções usam `bg-card/30` que somem em light mode.

## 8. Acessibilidade

- Vários botões só com ícone (Navbar mobile, ThemeToggle, Lang) — confirmar `aria-label` em todos.
- Contraste do `text-muted-foreground` em algumas seções (Solution "Antes") fica abaixo de 4.5:1 em dark mode.
- `outline-none` em vários botões — adicionar `focus-visible:ring`.

## 9. Conteúdo

- **Blog está ativo** mas sem destaque na home. Adicionar seção "Últimos artigos" antes do FAQ — bom pra SEO e retenção.
- Página `/comparativo` ou bloco "Por que FastProxy x Concorrentes" (Smartproxy, Bright Data) — todo mundo pesquisa isso antes de comprar.

## 10. Métricas (não-visual)

- Confirmar que Google Analytics / Meta Pixel / TikTok Pixel estão instalados e disparando eventos `purchase`, `add_to_cart`, `view_plan`. Sem isso, anúncios pagos não otimizam.
- Adicionar **Microsoft Clarity** (gratuito) pra mapa de calor — você vê onde o usuário trava no checkout.

---

## Resumo do que mais converte (se for fazer só 3 coisas)

1. **Seção de depoimentos + logos** na home (acima do Plans).
2. **Botão flutuante WhatsApp** no mobile.
3. **Páginas dedicadas** `/proxy-ipv6`, `/proxy-ipv4`, `/proxy-isp`, `/proxy-facebook-ads` com SEO próprio.

Me diz quais blocos você quer que eu execute — posso fazer todos, escolher os 3 de maior impacto, ou ir por etapas (ex: começar pelo bloco 1 + 5).
