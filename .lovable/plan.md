# Plano PWA — Experiência mobile completa

Foco: transformar o app numa experiência "tipo app nativo" no celular, com notificações sempre ativas (sem tela de preferências), badge no ícone, atalhos contextuais e tela otimizada pra copiar credenciais.

## 1. Notificações: tudo ligado por padrão

Remover qualquer UI de preferências. Toda nova conta entra automaticamente em **todas** as categorias:
- Expiração (7/3/1 dias antes)
- Pagamento (sucesso, falha, grace)
- Rotação disponível (reset mensal IPv6/ISP)
- Promoções e novidades (admin dispara manual)

Único controle visível pro usuário:
- **Botão "Ativar notificações"** na tela `/dashboard/notificacoes` (já existe) — apenas pede permissão do browser e registra o subscription
- **Link discreto "Desativar tudo"** no rodapé da mesma tela (cumpre LGPD/boas práticas) — remove subscription e marca opt-out global no profile

Sem toggles por categoria, sem janela de silêncio, sem antecedência customizável.

## 2. Badge no ícone (contador de expirando)

Mostrar número vermelho no ícone do app instalado = quantos proxies do usuário expiram nos próximos 7 dias.

Como funciona:
- API `navigator.setAppBadge(n)` chamada quando o app abre e quando uma notificação push chega
- Service worker recebe push com `metadata.badgeCount` e chama `setAppBadge`
- Ao abrir uma notificação de expiração ou renovar, badge atualiza
- Suportado: Chrome/Edge desktop, Android Chrome, iOS 16.4+ (Safari, requer PWA instalado)
- Fallback silencioso onde não há suporte

Server function nova: `getExpiringCount` retorna quantos proxies do user expiram em ≤7 dias. Chamada no mount do dashboard e após cada ação relevante.

## 3. Atalhos no ícone (long-press / right-click)

Adicionar ao `manifest.webmanifest` o array `shortcuts` com 4 entradas:

```text
- "Meus proxies"      → /dashboard
- "Comprar proxy"      → /produtos
- "Notificações"       → /dashboard/notificacoes
- "Suporte"            → /suporte (ou WhatsApp link)
```

Cada shortcut com ícone próprio 96x96. Funciona em Android Chrome (long-press no ícone), Windows (right-click na taskbar) e parcialmente no macOS dock.

## 4. Tela de copy rápido mobile

Nova rota `/dashboard/proxy/$id/quick` — full-screen, otimizada pra uso na rua:

```text
┌─────────────────────────┐
│ ← IPv6 BR · expira 12d  │
├─────────────────────────┤
│                         │
│    [ HOST:PORT ]   📋   │  ← tap copia tudo formatado
│    [ USER ]        📋   │
│    [ PASS ]    👁  📋   │  ← olho mostra/esconde
│                         │
│  ─────────────────────  │
│                         │
│   📋 Copiar HTTP        │  ← user:pass@host:port
│   📋 Copiar SOCKS5      │
│   📋 Copiar JSON        │
│   🔁 Rotacionar IP      │  ← se elegível
│                         │
└─────────────────────────┘
```

- Botões grandes (touch target ≥48px)
- Cores de alto contraste
- Haptic feedback no copy (`navigator.vibrate(20)`)
- Toast "Copiado" simples
- Acessível também via link da lista de proxies (ícone de "expandir")

## 5. Melhorias do manifest e instalação

- `display: "standalone"`, `orientation: "portrait"`, `theme_color` alinhado ao design
- `categories: ["business", "productivity"]`
- Splash screen automática gerada do icon-512
- Banner de instalação não-intrusivo (1x por sessão, dismissível 30 dias) no dashboard quando `beforeinstallprompt` dispara
- Tela `/dashboard/notificacoes` já tem o tutorial iOS/Android/Desktop — mantém

## 6. Arquivos a criar/editar

**Editar:**
- `public/manifest.webmanifest` — adicionar `shortcuts`, `orientation`, `categories`
- `public/sw.js` — handler de push atualiza badge via `setAppBadge`
- `src/routes/_authenticated.dashboard.notificacoes.tsx` — remover qualquer toggle de categoria, adicionar link "Desativar tudo"
- `src/lib/notifications.functions.ts` — adicionar `getExpiringCount` e `disableAllNotifications`
- `src/routes/_authenticated.dashboard.tsx` (ou layout) — chamar `setAppBadge` no mount + banner de install

**Criar:**
- `src/routes/_authenticated.dashboard.proxy.$id.quick.tsx` — tela de copy rápido
- `src/hooks/use-app-badge.ts` — wrapper seguro pro setAppBadge
- `src/hooks/use-install-prompt.ts` — gerencia `beforeinstallprompt`
- `src/components/install-banner.tsx` — banner dismissível
- 4× ícones de shortcut em `public/shortcuts/` (192x192, gerados por imagegen)

## 7. Limitações conhecidas (informar ao usuário)

- **Badge no iOS**: só funciona se o app for **adicionado à tela de início** (PWA instalado) e iOS ≥16.4
- **Push no iOS**: idem — só notifica se instalado
- **Atalhos no iOS**: não suportados (Apple não implementa `shortcuts` do manifest)
- **Tudo funciona no app publicado**, não no preview do editor (service worker fica bloqueado em iframe)

## Fora do escopo (deixar pra depois)

- Modo offline / cache de credenciais (você não selecionou)
- Page de preferências granulares (você optou por "tudo ligado")
- Share target, web share API
- Recomendações IA, cashback, modo revendedor

Pronto pra implementar — começo pela base (manifest + shortcuts + badge) e termino pela tela de copy rápido?
