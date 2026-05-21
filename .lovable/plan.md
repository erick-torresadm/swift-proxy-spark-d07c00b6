## Problema

No PWA instalado (iOS principalmente), o `apple-mobile-web-app-status-bar-style: black-translucent` faz o app ocupar a área do notch/status bar. Hoje o Navbar usa:

- Barra de utilidades: `fixed top-0` (h-8)
- Header principal: `fixed top-8 sm:top-10`

Sem `env(safe-area-inset-top)`, esses elementos ficam atrás do notch e os botões viram inacessíveis.

## Correção (apenas `src/components/site/Navbar.tsx`)

1. **Barra utilitária superior** — adicionar padding-top de safe area e aumentar altura efetiva:
   - Trocar classes por algo como: `style={{ paddingTop: "env(safe-area-inset-top)" }}` mantendo `h-8` como min, ou usar `pt-[env(safe-area-inset-top)] min-h-8`.

2. **Header (logo + nav)** — empurrar pra baixo o suficiente:
   - Substituir `top-8 sm:top-10` por `style={{ top: "calc(env(safe-area-inset-top) + 2rem)" }}` (e `2.5rem` no sm via classe responsiva ou estilo).

3. **Menu mobile drawer** — já é `mt-2` relativo ao header, então segue junto automaticamente. Verificar que não fica colado no topo quando aberto.

4. **Padding-right da barra utilitária** — adicionar `env(safe-area-inset-right)` para landscape com notch.

## Bônus opcional

Em `src/routes/__root.tsx`, considerar trocar `apple-mobile-web-app-status-bar-style` de `black-translucent` para `default` ou `black`, o que faria o iOS reservar a área do status bar automaticamente. Mas isso muda o visual (perde o efeito de "fullscreen"). **Não vou fazer por padrão** — só se você preferir.

## Arquivos alterados

- `src/components/site/Navbar.tsx` (único arquivo)

Sem mudança de lógica, sem mudança de backend, só CSS inline com `env(safe-area-inset-*)`.
