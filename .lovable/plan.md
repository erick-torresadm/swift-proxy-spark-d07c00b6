## Objetivo

Passar pro opencode (IA da VPS) exatamente o contrato que o painel FastProxy já espera, pra ele reconstruir a API Flask sobre o novo setup (IPv6 nativo HostZone + Temporalitas) sem quebrar nada do lado do painel. Não há mudança de código no painel exceto trocar a URL da VPS quando ela subir.

## Decisões (respostas às 4 perguntas do opencode)

1. **Modelo por cliente:** username/senha/porta **próprios** por cliente (opção A). Pool compartilhado não permite suspender inadimplente individual nem rotacionar IP do Facebook Ads.
2. **Quantidades por plano:**
   - IPv6 BR R$29,90/mês → 10 IPs, sem rotação.
   - IPv6 Facebook Ads R$80/mês → 10 IPs + 10 rotações/mês.
   - IPv4 e ISP continuam no ProxySeller, **não** entram na VPS.
3. **Painel:** Lovable + Supabase gerenciado; IA da VPS não precisa acessar. Toda integração é HTTP.
4. **Caminho:** opção A — opencode sobe a API na VPS e me passa URL pública em 80/443.

## Contrato HTTP obrigatório

Auth: `Authorization: Bearer ***REMOVED***` em todas as rotas.

- `GET /health` → `{ status, uptime_seconds, blocks, proxies }`
- `POST /blocks` `{ size, duration_days, customer_ref }` → `{ id, size, expires_at, proxies:[{ ip, port, username, password, protocol, block_id }] }`
- `GET /blocks` → lista com o mesmo shape (`proxies[]` incluso)
- `GET /blocks/:id` → mesmo shape
- `POST /blocks/:id/renew` `{ days }` → bloco com `expires_at` estendido
- `POST /blocks/:id/cancel` → libera bloco (só quando 0 credenciais vinculadas)
- `POST /credentials` `{ username, password, block_id }` → upsert (usado na reativação de inadimplente que voltou a pagar)
- `DELETE /credentials/:username` → suspende sem liberar IP
- `POST /credentials/:username/rotate` → troca IP mantendo `port`+`username`+`password`, retorna proxy atualizado
- `GET /audit` → últimas ações

## Invariantes que a VPS tem que respeitar

- `port` do cliente é imutável enquanto a credencial existir.
- Suspender credencial não devolve o IPv6 ao pool — bloco IPv6 é indivisível até expirar/cancelar.
- `duration_days`: 30 (mensal) / 365 (anual).
- Bloco só pode ser cancelado quando não há credenciais vinculadas.

## Passos do lado do painel

1. Aguardar opencode subir a API e publicar em 80/443 (preferência HTTPS com Let's Encrypt em `api.fastproxy.com.br`).
2. Atualizar o secret `FASTPROXY_VPS_API_URL` com a URL pública.
3. Testar em `/admin/vps`: `/health` deve responder 200 e o botão "Emitir novo bloco" deve criar bloco de 10 IPs.
4. Smoke test end-to-end: 1 pedido real IPv6 BR de baixo valor → bloco criado, credenciais funcionam via curl.

Sem alterações de código previstas — o adapter `src/lib/fastproxy-vps.server.ts` já implementa esse contrato exato.
