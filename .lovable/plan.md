# Estratégia: manter mensal + adicionar aba de "Pagamento único" (pacotes prépagos)

Vamos manter tudo que já existe hoje (planos mensais e anuais em `/#planos`, checkout recorrente via `checkout.functions.ts`) **sem tocar em nada dessa parte**. Em paralelo, dar destaque à aba nova de **pagamento único** (pacotes prépagos IPv6 BR) que já existe em `/pacotes` mas hoje está escondida.

Como o IPv6 BR agora é infra própria (custo marginal ~zero), a aba prépaga vira o principal motor de aumento de ticket e redução de churn — sem canibalizar o recorrente.

## O que muda na experiência

1. **Home `/`** ganha um bloco novo abaixo dos planos mensais: "Prefere pagar uma vez só? Veja pacotes prépagos" com CTA para `/pacotes`.
2. **Página `/planos` (ou seção `#planos` da home)** ganha um toggle no topo:
   - `Mensal` · `Anual` · **`Pagamento único (novo)`** → o terceiro leva pra `/pacotes`.
3. **Página `/pacotes`** (já existe) recebe:
   - Comparativo lado-a-lado "Mensal vs Pacote prépago" mostrando quanto economiza.
   - Selo "MAIS VENDIDO" no combo 5 IPs / 3 meses e "MELHOR CUSTO" no 25 IPs / 12 meses.
   - Bloco de confiança: "IPv6 brasileiros próprios · Estoque ilimitado · Troca imediata".
4. **Navbar**: link "Pacotes" já está lá — só reforçar visualmente com badge "novo".
5. **Fluxo de cancelamento `/dashboard/cancelar`**: antes do cupom 30% que já existe, oferecer "Migre para um pacote prépago e trave o preço" com link direto pra `/pacotes`.

## Grade de pacotes recomendada (IPv6 BR)

Preencher via admin `/admin/pacotes` (CRUD já existe). Base sugerida:

```text
QTD IPs │ 1 mês │ 3 meses (-15%) │ 6 meses (-25%) │ 12 meses (-40%)
────────┼───────┼────────────────┼────────────────┼─────────────────
   5    │   ✓   │ MAIS VENDIDO   │       ✓        │        ✓
  10    │   ✓   │      ✓         │  RECOMENDADO   │        ✓
  25    │       │      ✓         │       ✓        │  MELHOR CUSTO
  50    │       │      ✓         │       ✓        │        ✓
```

Você define os preços exatos no admin — o plano só entrega a estrutura visual.

## Gatilhos anti-churn embutidos no pacote

- Cobrança única → não tem o "boleto/cartão do mês" que gera cancelamento.
- Bônus visível: 12 meses = "14 meses pelo preço de 12" (2 meses grátis).
- Trava de preço até 2027 (texto no card).
- Substituição gratuita em caso de bloqueio (já é a realidade da sua infra).

## O que NÃO muda

- Planos mensais e anuais recorrentes continuam funcionando exatamente igual.
- `checkout.functions.ts`, order bumps, cupons, upsell — nada disso é mexido.
- Webhook Stripe e alocação de proxies — sem alterações.

## Escopo técnico

Apenas frontend/apresentação, sem lógica de negócio nova:

1. **`src/components/site/Plans.tsx`**: adicionar terceira aba "Pagamento único" no toggle mensal/anual, que ao clicar navega pra `/pacotes` (não renderiza pacotes inline pra não duplicar código).
2. **`src/routes/index.tsx`** (ou onde a home monta as seções): inserir um bloco curto "Prefere pagar uma vez?" com CTA pra `/pacotes` logo depois de `<Plans />`.
3. **`src/routes/pacotes.tsx`**:
   - Adicionar hero com comparativo mensal × pacote (economia em %).
   - Adicionar badges "MAIS VENDIDO" / "MELHOR CUSTO" (campo `highlight` opcional, ou hardcode por `quantity+term_months` se `product_packages` ainda não tiver esse campo — verifico antes de codar).
   - Bloco de trust logo abaixo do hero: 3 selos (Próprio · Ilimitado · Troca imediata).
4. **`src/components/site/Navbar.tsx`**: badge "novo" ao lado do link "Pacotes".
5. **`src/routes/_authenticated.dashboard.cancelar.tsx`**: inserir card "Migre para prépago" como primeira oferta de retenção, antes do cupom.

Sem migração de banco (a menos que a gente decida adicionar `highlight_label` em `product_packages` — te pergunto abaixo).

## Perguntas antes de codar

1. **Selos "MAIS VENDIDO / MELHOR CUSTO"**: prefere que eu **adicione uma coluna `highlight_label`** em `product_packages` (você controla no admin) ou **hardcode** por regra fixa (5×3m = mais vendido, 25×12m = melhor custo)?
2. **Toggle na home**: a terceira aba do toggle "Mensal · Anual · Pagamento único" deve **navegar** pra `/pacotes` ou **renderizar os pacotes inline** dentro da seção `#planos`? (navegar é mais simples e evita duplicação.)
3. **Cancelamento**: quer que o card de retenção "migre para prépago" apareça **antes** do cupom 30% (ou seja, tentamos vender pacote primeiro, cupom só se recusar), ou **depois**?
