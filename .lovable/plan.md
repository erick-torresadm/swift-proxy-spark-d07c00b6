# Priorizar plano anual com preço mensal equivalente

Objetivo: aumentar conversão em anual (mais receita previsível, menos inadimplência) mostrando o plano anual já selecionado por padrão, com o preço apresentado em formato "mensal equivalente" e a economia destacada vs. o mensal cheio.

## Mudanças em `src/components/site/Plans.tsx`

1. **Padrão = anual**
   - `useState<Billing>("yearly")` (era `"monthly"`).
   - Toggle continua funcionando para quem quiser ver mensal.

2. **Toggle redesenhado para incentivar o anual**
   - Label "Anual" recebe destaque (cor primary + bold).
   - Badge ao lado do "Anual": "ECONOMIZE 17%" + "2 meses grátis" (em vez de só "discount_badge").
   - Pequeno helper text abaixo: "Pague 1x por ano e economize" quando anual; "Renova mensalmente" quando mensal.

3. **Card de preço (modo anual)**
   - Preço grande = **mensal equivalente** (yearly/12) — como já está.
   - Acima do preço grande: preço mensal cheio **riscado** (ex.: ~~R$ 29,90/mês~~) — substituindo `oldPrice` quando billing=yearly em todos os planos, não só no fbads.
   - Abaixo do "/mês cobrado anualmente": linha em verde com **"Economia de R$ X,XX por ano"** (= (monthly − yearlyMonthly) × 12).
   - Texto pequeno: "Total: R$ Y,YY/ano cobrado 1x" (= yearlyMonthly × 12).

4. **Card de preço (modo mensal)**
   - Mantém preço atual.
   - Adiciona linha informativa: "Economize R$ X,XX/ano mudando para o anual →" (clicável, alterna o toggle).

5. **CTA**
   - Mantém `to="/checkout"` com `billing` atual.
   - No modo anual, texto do botão vira "Assinar anual" (mensal: "Assinar mensal" / featured mantém `cta_featured`).

## Strings i18n (`src/i18n/*`)
Adicionar chaves novas em pt/en/es já existentes:
- `plans.yearly_badge_save` → "Economize 17%"
- `plans.yearly_badge_months` → "2 meses grátis"
- `plans.yearly_total` → "Total {{total}} cobrado 1x/ano"
- `plans.yearly_savings` → "Economia de {{amount}} por ano"
- `plans.switch_to_yearly` → "Economize {{amount}}/ano no plano anual"
- `plans.cta_yearly` / `plans.cta_monthly`
- `plans.helper_yearly` / `plans.helper_monthly`

## Detalhes técnicos
- Cálculo já existe: `yearlyMonthly = live.yearly/12` ou fallback `monthly * (1 - 0.175)`.
- `savingsPerYear = (monthly - yearlyMonthly) * 12`
- `yearlyTotal = yearlyMonthly * 12`
- Formatar via `format()` do `useCurrency` para respeitar BRL/USD.
- Cor da economia: classe `text-emerald-500` (consistente com sucesso); não tocar tokens de design.
- Sem mudança em checkout/backend — o parâmetro `billing` já é propagado e o Stripe já tem os preços anuais (`price_yearly_cents`).

## Arquivos
- editar: `src/components/site/Plans.tsx`
- editar: arquivos de tradução em `src/i18n/` (pt, en, es) para as novas chaves
