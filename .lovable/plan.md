# Estoque manual de IPv6 BR (modo híbrido API ↔ Estoque)

Objetivo: além do modo VPS/API que já existe, criar um **modo Estoque Manual** para IPv6 BR. Você cola/importa IPs gerados na sua máquina, o painel guarda como estoque, entrega ao cliente na compra, renova junto com a assinatura e avisa via PWA quando o estoque estiver baixo. Um toggle no `/admin/vps` decide qual fonte usar para novas alocações.

## Como vai funcionar

**Toggle de fonte (por produto IPv6 BR)**
- `/admin/vps` ganha um seletor de **modo de fornecimento**: `api` (VPS) ou `stock` (manual). Persistido em `provider_settings` (linha `fastproxy_vps`, campo novo `source_mode`).
- `api` (ligado) → aloca chamando a VPS, como hoje.
- `stock` (desligado) → aloca puxando linhas livres de `proxy_stock` que eu inseri manualmente. **Nada bate na VPS.**
- Alternar não mexe em ninguém que já tá com proxy — só muda a fonte das **próximas** alocações e renovações.

**Importar IPs manualmente (modo estoque)**
- Nova aba `/admin/vps/estoque` (ou seção dentro de `/admin/vps`) com:
  - Textarea que aceita colar em lote nos formatos comuns: `ip:port:user:pass`, `user:pass@ip:port`, `ip:port` (aí user/pass vem em campos separados no topo do lote).
  - Escolher produto destino (IPv6 BR padrão, IPv6 FB Ads, etc.), país, protocolo (http/socks5), validade padrão (ex.: 30 dias).
  - Preview do que vai entrar + botão "Importar N IPs".
  - Deduplicação por `host:port` (skipa duplicados, mostra quantos foram ignorados).
- Cada linha vira `proxy_stock` com `status='available'`, `provider_order_id=NULL` (estoque manual, sem pedido no fornecedor), `expires_at` = agora + validade.
- Ao lado, tabela do estoque atual com filtro por produto, status, e ação **Excluir** / **Marcar como quebrado**.

**Alocação no modo estoque**
- Reusar o caminho normal de `allocation.server.ts`: quando `source_mode='stock'` para o produto, pula a chamada VPS e só faz `SELECT ... FROM proxy_stock WHERE status='available'` (comportamento que já existe para IPv4/ISP). Não muda nada no cliente final: ele recebe IP igual, com credencial dele.
- Rotação FB Ads no modo estoque: troca por outra linha `available` do mesmo produto (é o comportamento atual do fallback).

**Renovação no modo estoque**
- `runRenewalSweep` para linhas com `provider_order_id=NULL`: só estende `expires_at` do `proxy_stock` + do `customer_proxies` para +30 dias quando a `orders` correspondente tá `active`. **Não chama VPS**, não gasta nada. Pedido cancelado/inadimplente: libera a linha de volta pra `available` (igual IPv4/ISP hoje).

**Alertas de estoque baixo (PWA)**
- Cron `fulfillment-sweep` já roda de minuto em minuto. Adicionar checagem: se `available` de um produto em modo `stock` cair abaixo do `restock_rules.min_stock` (ou default 10), disparar **push admin** ("Estoque IPv6 BR abaixo de 10, adicione mais IPs") — com throttle de 1 alerta a cada 6h por produto pra não spammar.
- Também aparece um banner amarelo em `/admin/vps` e em `/admin/inventory` quando estoque < mínimo.

**Auditoria**
- Cada importação em lote loga em `audit_log` com `source='vps_manual_stock'`, quantos IPs entraram, quem importou.

## Detalhes técnicos

- `provider_settings.fastproxy_vps` ganha coluna `source_mode text default 'api'` (`api` | `stock`). Migração cria coluna + default.
- Adapter `fastproxy-vps.server.ts` não muda. `allocation.server.ts` lê `source_mode` antes de decidir chamar `vps.createBlock` vs. seguir pelo caminho de estoque.
- Parser do textarea é tolerante: divide por linhas, aceita `,` `;` `:` `@` como separadores comuns, ignora linhas vazias/começadas por `#`.
- Não altera nada de IPv4, ISP, IPv6 EUA — segue tudo em ProxySeller.

## Fora do escopo agora

- Não vou criar planos novos ainda; quando você mandar os planos, ajusto `products` numa segunda passada.
- Não vou mexer no OpenCode/VPS. Modo API continua chamando a URL que tá em `FASTPROXY_VPS_API_URL`.

Se estiver ok, aplico a migração + o admin de estoque + o ajuste no allocation/renewal + o alerta PWA.
