# 📚 Manual da Plataforma — Catálogo de Proxies

> **LEIA SEMPRE ANTES DE MEXER EM ALOCAÇÃO, ESTOQUE OU PROVISIONAMENTO.**
> Este arquivo é a fonte da verdade. Se a regra mudar, atualize aqui primeiro.

---

## 1. Tipos de produto disponíveis

A plataforma vende **4 famílias** de proxy, todas via ProxySeller:

| Slug         | Categoria  | País | Plano / Uso                            | Bloco mínimo no provedor | `delivery_mode` |
|--------------|------------|------|----------------------------------------|--------------------------|-----------------|
| `ipv6-br`    | `ipv6`     | BR   | IPv6 genérico Brasil                   | **10 IPs**               | `stock`         |
| `ipv6-us`    | `ipv6`     | US   | IPv6 genérico EUA                      | **10 IPs**               | `stock`         |
| `ipv6-fb-br` | `ipv6_fb`  | BR   | IPv6 Facebook Ads BR (com troca de IP) | **10 IPs**               | `stock`         |
| `ipv6-fb-us` | `ipv6_fb`  | US   | IPv6 Facebook Ads EUA (com troca de IP)| **10 IPs**               | `stock`         |
| `ipv4-br`    | `ipv4`     | BR   | IPv4 dedicado Brasil                   | 1 IP                     | `direct`        |
| `ipv4-us`    | `ipv4`     | US   | IPv4 dedicado EUA                      | 1 IP                     | `direct`        |
| `isp-br`     | `isp`      | BR   | ISP residencial Brasil                 | 1 IP                     | `direct`        |
| `isp-us`     | `isp`      | US   | ISP residencial EUA                    | 1 IP                     | `direct`        |

> **Importante:** o cliente prioriza ISP Brasil. ISP US existe mas não é divulgado.

---

## 2. Regra crítica do IPv6 (família compartilhada)

```
IPv6 BR  ⇆  IPv6 FB BR   →  mesmo pool de IPs upstream (mesmo countryId=20554)
IPv6 US  ⇆  IPv6 FB US   →  mesmo pool de IPs upstream (mesmo countryId=785)
```

> **O IPv6 é o mesmo para todos, só muda a localidade.**
>
> Um IP IPv6 BR comprado para `ipv6-br` pode ser usado para atender um pedido de
> `ipv6-fb-br` — e vice-versa. **Nunca compre um bloco novo se existir IP livre
> no irmão de mesmo país.**

A diferença do plano **IPv6 Facebook Ads** é o *comportamento da plataforma*
(troca de IPs sob demanda), não o tipo do IP.

---

## 3. Bloco mínimo na ProxySeller

- **IPv6 (ambas categorias):** mínimo de **10 IPs por compra**.
  → Se um cliente pede 1 IP e não há estoque, compramos 10 e guardamos 9.
- **IPv4 / ISP:** compra unitária, sob demanda (`delivery_mode = direct`).

---

## 4. Ordem de alocação (ALOCAR NESTA ORDEM, SEMPRE)

Quando um pedido fica `paid`, o `allocateProxiesForOrder` executa:

1. **Estoque local do próprio produto** — `proxy_stock` com `status='available'`
   e `product_id = order.product_id`.
2. **Estoque local do produto irmão** (mesma família + mesmo país) — só para
   `ipv6` ↔ `ipv6_fb`. Ao usar, o IP é **transferido** (atualiza `product_id`).
3. **Pedidos pendentes do provedor (`provider_orders.status='pending'`)** —
   reaproveita blocos já comprados que ainda estão provisionando.
4. **Sync do provedor (`/proxy/list/{kind}`)** — puxa para o estoque qualquer
   IP que já existe na ProxySeller mas não está registrado em `proxy_stock`.
   *Isto evita gastar dinheiro à toa.*
5. **Só então** chama `purchaseProxyBlock` para comprar um bloco novo (10 IPs
   para IPv6, exato para IPv4/ISP).

> Toda compra nova → notifica admins (`notifyAllAdmins`) e registra em
> `provider_orders`. Toda compra é protegida por `purchase_locks` para evitar
> compras concorrentes duplicadas.

---

## 5. Restock proativo

Depois de alocar, se o estoque do produto cair **abaixo do `restock_threshold`**
(default = 2), dispara compra antecipada **em background** — mas só para
`delivery_mode='stock'` (IPv6 / IPv6-FB).

---

## 6. Renovação (`renewProxyBlocksForOrder`)

- Para IPv6/IPv6-FB: usa `/prolong/make` para estender o **bloco inteiro** que
  contém os IPs do cliente. Renovamos o bloco todo, não IPs individuais.
- IPv4/ISP: ainda não há auto-renovação implementada.

---

## 7. Checklist antes de mexer no `allocation.server.ts`

- [ ] Estoque local foi consultado primeiro?
- [ ] Estoque do **irmão IPv6** foi consultado antes de comprar?
- [ ] `provider_orders` pendentes foram reaproveitados?
- [ ] `/proxy/list` foi sincronizado antes da compra?
- [ ] `purchase_lock` impede duplicação?
- [ ] Compra nova foi logada em `provider_orders` + `notifyAllAdmins`?
