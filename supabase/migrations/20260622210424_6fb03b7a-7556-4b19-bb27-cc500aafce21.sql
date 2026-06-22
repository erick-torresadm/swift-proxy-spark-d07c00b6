INSERT INTO public.posts (
  slug, title, excerpt, content_md, cover_image_url, status, published_at,
  meta_title, meta_description, keyword_primary, keywords_secondary, faq,
  reading_time_minutes, view_count, display_author_name, category_id
)
VALUES (
  'proxy-ipv6-google-ads',
  'Proxy IPv6 para Google Ads: economia, performance e como configurar',
  'Google Ads é menos paranoico que Facebook, mas castiga pesado quando detecta. Proxy IPv6 dedicado é o equilíbrio entre segurança e custo para escalar contas.',
  $PMD$## Google Ads e o jogo silencioso do IP

Diferente do Facebook, o Google quase nunca bloqueia conta na primeira ação. Ele observa, acumula, e quando age, suspende com pouca chance de recurso. O IP entra nesse cálculo com peso real.

## Por que IPv6 funciona bem no Google

- Google é uma das maiores ofertantes de infraestrutura IPv6 do mundo. Suportam nativo.
- O pool de IPv6 é tão grande que cada conta sua sai com IP único, sem competir com histórico de fraude.
- Custa 3-5x menos que IPv4 ou ISP.

Resultado: para gestores que rodam 5+ contas em paralelo, **IPv6 dedicado é o padrão racional**.

## Setup passo a passo

### 1. Contrate o proxy

Plano IPv6 dedicado, 1 unidade por conta Google Ads. Anote `host:porta:usuario:senha`.

### 2. Configure no antidetect

```
Tipo: HTTP ou SOCKS5
Host: seu-host.fastproxy.com.br
Porta: 8001
Usuário: usr_xxxx
Senha: senha_xxxx
```

### 3. Teste antes do login

Abra `https://test-ipv6.com` no perfil. Confirme:
- IPv6 ativo
- País BR (ou país-alvo)
- Sem warnings de DNS leak

### 4. Login no Google Ads

Faça login pela conta Gmail vinculada. Se o Google pedir verificação, **não abandone** — confirme por SMS no número cadastrado. Verificação respondida = score sobe.

### 5. Rotina de uso

- Sempre acesse pelo mesmo proxy
- Não alterne entre proxy e seu IP pessoal
- Configure timezone do navegador para Brasília

## Erros que ainda matam conta Google

- **Trocar de país no meio do mês:** suspensão por inconsistência geográfica.
- **Pagamento de cartão internacional num perfil BR:** alerta vermelho.
- **Múltiplos logins simultâneos** do mesmo Gmail em IPs diferentes.

## Quando subir para ISP

Para contas com gasto acima de R$ 30k/mês ou que já passaram por suspensão, vale migrar do IPv6 para **proxy ISP residencial**. Custo sobe, mas o IP residencial puro praticamente zera o risco de bloqueio por inconsistência.

## Resumo

IPv6 dedicado por conta Google Ads é o setup padrão para 2026: barato, eficiente, compatível. ISP fica reservado para contas top de receita.
$PMD$,
  'https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?w=1600&q=80',
  'published',
  now() - interval '14 days',
  'Proxy IPv6 para Google Ads: Setup e Boas Práticas',
  'Como usar proxy IPv6 dedicado em Google Ads sem disparar verificação, economizando até 70% vs ISP. Setup completo passo a passo.',
  'proxy google ads',
  ARRAY['proxy ipv6 google ads','google ads bloqueado','contingência google ads','proxy adwords','comprar proxy google']::text[],
  '[{"question": "Google Ads aceita IPv6?", "answer": "Sim, nativamente. A própria infraestrutura do Google já é IPv6-first. Não há fricção técnica."}, {"question": "Posso usar o mesmo proxy IPv6 em Facebook e Google ao mesmo tempo?", "answer": "Não recomendado. Cada plataforma observa o IP de forma diferente; isole um proxy por conta para evitar vínculo cruzado."}, {"question": "Quanto tempo até o Google confiar no novo IP?", "answer": "Cerca de 7-15 dias de uso consistente do mesmo proxy. Por isso troca frequente de IP é o oposto do que você quer."}, {"question": "Preciso de proxy se rodo uma única conta MCC?", "answer": "Se você acessa só do seu IP residencial fixo, não. Mas se usa antidetect, várias contas, ou se já teve suspensão, o proxy dedicado é proteção barata."}]'::jsonb,
  7, 850, 'Time FastProxy',
  (SELECT id FROM public.post_categories WHERE slug = 'trafego-pago')
)
ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, content_md=EXCLUDED.content_md, cover_image_url=EXCLUDED.cover_image_url, meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description, keyword_primary=EXCLUDED.keyword_primary, keywords_secondary=EXCLUDED.keywords_secondary, faq=EXCLUDED.faq, reading_time_minutes=EXCLUDED.reading_time_minutes, category_id=EXCLUDED.category_id, status='published', published_at=EXCLUDED.published_at, updated_at=now();

INSERT INTO public.post_tag_map (post_id, tag_id) SELECT p.id, t.id FROM public.posts p, public.post_tags t WHERE p.slug = 'proxy-ipv6-google-ads' AND t.slug IN ('google-ads','ipv6','proxy-dedicado') ON CONFLICT DO NOTHING;

INSERT INTO public.posts (
  slug, title, excerpt, content_md, cover_image_url, status, published_at,
  meta_title, meta_description, keyword_primary, keywords_secondary, faq,
  reading_time_minutes, view_count, display_author_name, category_id
)
VALUES (
  'configurar-proxy-adspower-multilogin-dolphin',
  'Como Configurar Proxy no AdsPower, Multilogin e Dolphin Anty',
  'Os três antidetects mais usados do mercado têm fluxos parecidos mas detalhes que mudam tudo. Este tutorial mostra cada um sem rodeios.',
  $PMD$## Antes de começar

Tenha em mãos do seu painel FastProxy:

```
Host:    proxy-br.fastproxy.com.br
Porta:   8001
Usuário: usr_a1b2c3
Senha:   sX9p2Lz!
Tipo:    SOCKS5 (preferido) ou HTTP
```

## AdsPower

1. Abra o AdsPower → **Browser profiles** → **New profile**.
2. Na aba **Proxy configuration**, escolha **Custom** como provider.
3. Tipo: `SOCKS5`. Cole host, porta, usuário e senha.
4. Clique em **Check proxy** — deve retornar IP brasileiro.
5. Em **Fingerprint**, deixe timezone como `America/Sao_Paulo` e idioma `pt-BR`.
6. Salve e abra. Faça o primeiro acesso em `whoer.net`.

### Dica AdsPower
Se aparecer "proxy connection failed", troque o tipo para `HTTP` — algumas redes corporativas bloqueiam SOCKS5 saída.

## Multilogin (X / Mimic)

1. **New profile** → **Browser type**: Mimic (Chromium-based).
2. Aba **Storage**: cloud (sincroniza entre máquinas).
3. Aba **Proxy**: tipo `socks5`. Cole as credenciais.
4. **Test proxy** — deve mostrar bandeira BR e ASN da FastProxy.
5. **Geolocation**: marque **Auto fill based on IP** para que browser e IP batam.
6. Salve.

### Dica Multilogin
Multilogin tem leak de WebRTC ativo por padrão. Vá em **Advanced** e configure **WebRTC** para `Altered` — usa o IP do proxy em vez do real.

## Dolphin Anty

1. **Profiles** → **Create profile**.
2. **Proxies** → **Add new** → tipo `SOCKS5`, cole host/porta/user/pass.
3. **Check proxy** → status `OK`.
4. **Fingerprint**: clique em **Generate** para sortear uma coerente com o IP.
5. **Timezone**: `Auto (based on IP)`.
6. Salve e abra.

### Dica Dolphin
Se o status do proxy alternar entre OK e erro, é DNS resolvendo lento. Force DNS `1.1.1.1` nas configurações avançadas do perfil.

## Checklist pós-configuração (vale para qualquer um)

- [ ] `whoer.net` mostra 100% trust score
- [ ] `browserleaks.com/ip` confirma IP do proxy
- [ ] `dnsleaktest.com` não vaza DNS local
- [ ] `ipleak.net` confirma país coerente
- [ ] Timezone bate com IP (ex: BR = -03:00)

## Erro mais comum: WebRTC leak

WebRTC vaza o IP real mesmo com proxy ativo. Os três antidetects acima já lidam com isso — desde que você marque a opção. **Sempre confirme em `browserleaks.com/webrtc`** antes de subir BM nova.

Configurado certo, o navegador vira "uma máquina inteira só dele" — fingerprint única, IP único, sem vazamento. É o que sustenta multi-conta no nível profissional.
$PMD$,
  'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1600&q=80',
  'published',
  now() - interval '17 days',
  'Configurar Proxy no AdsPower, Multilogin e Dolphin (Tutorial)',
  'Passo a passo com prints para configurar proxy dedicado nos três principais antidetects do mercado. Funciona em qualquer plano.',
  'configurar proxy adspower',
  ARRAY['proxy adspower','proxy multilogin','proxy dolphin anty','tutorial antidetect proxy','como usar proxy']::text[],
  '[{"question": "Qual antidetect funciona melhor com proxy SOCKS5?", "answer": "Os três (AdsPower, Multilogin, Dolphin) suportam SOCKS5 nativo. Para a maioria dos casos AdsPower entrega o melhor custo-benefício no Brasil."}, {"question": "Preciso pagar por antidetect ou tem grátis?", "answer": "AdsPower tem plano grátis até 5 perfis — suficiente para começar. Dolphin tem 10 perfis grátis. Multilogin é pago desde o início."}, {"question": "WebRTC vaza o IP real mesmo usando proxy?", "answer": "Sim, por padrão. Os três antidetects têm opção para mascarar — sempre ative e teste em browserleaks.com/webrtc antes de subir BM."}, {"question": "Posso usar o mesmo proxy em dois perfis do antidetect?", "answer": "Tecnicamente sim, mas perde o propósito: o objetivo é IP único por conta. Use um proxy por perfil."}]'::jsonb,
  6, 775, 'Time FastProxy',
  (SELECT id FROM public.post_categories WHERE slug = 'tutoriais')
)
ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, content_md=EXCLUDED.content_md, cover_image_url=EXCLUDED.cover_image_url, meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description, keyword_primary=EXCLUDED.keyword_primary, keywords_secondary=EXCLUDED.keywords_secondary, faq=EXCLUDED.faq, reading_time_minutes=EXCLUDED.reading_time_minutes, category_id=EXCLUDED.category_id, status='published', published_at=EXCLUDED.published_at, updated_at=now();

INSERT INTO public.post_tag_map (post_id, tag_id) SELECT p.id, t.id FROM public.posts p, public.post_tags t WHERE p.slug = 'configurar-proxy-adspower-multilogin-dolphin' AND t.slug IN ('adspower','multilogin','dolphin-anty','tutorial') ON CONFLICT DO NOTHING;

INSERT INTO public.posts (
  slug, title, excerpt, content_md, cover_image_url, status, published_at,
  meta_title, meta_description, keyword_primary, keywords_secondary, faq,
  reading_time_minutes, view_count, display_author_name, category_id
)
VALUES (
  'proxy-residencial-vs-ipv6-trafego-pago',
  'Proxy Residencial vs IPv6: Qual Escolher para Tráfego Pago',
  'Os dois funcionam. Mas a diferença de preço e de proteção é grande — e escolher errado significa ou queimar dinheiro à toa ou ficar exposto demais.',
  $PMD$## A diferença que importa

**Proxy residencial (ISP)** = IP que sai de uma operadora de internet real (Vivo, Claro, Oi), exatamente como o da casa do seu cliente. Plataformas tratam como tráfego humano.

**Proxy IPv6 dedicado** = IP de datacenter, mas exclusivo seu, com pool gigantesco que evita marcação por histórico. Plataformas tratam como tráfego comum.

A diferença prática: o residencial é **indistinguível de um usuário comum**, o IPv6 é **um IP limpo de datacenter**. Os dois funcionam — para coisas diferentes.

## Comparativo direto

| Critério | IPv6 dedicado | ISP (residencial) |
|----------|---------------|-------------------|
| Origem do IP | Datacenter | Operadora real |
| Preço mensal (BR) | R$ 8-15 | R$ 35-60 |
| Detecção como datacenter | possível | impossível |
| Velocidade | excelente | boa (depende da operadora) |
| Disponibilidade de IPs únicos | infinita | limitada |
| Geolocalização | exata por ASN | exata por bairro |
| Ideal para Facebook Ads | sim | sim, premium |
| Ideal para Google Ads | sim | sim, premium |
| Ideal para scraping volume | sim | overkill |
| Ideal para conta BM principal | ok | melhor |

## Quando IPv6 é suficiente

- Você roda **5+ BMs em paralelo** e precisa economia de escala
- **Contas frias**, novas, ainda em fase de aquecimento
- **Scraping** ou automação em volume
- **Antidetect** com fingerprint bem configurada
- Gasto por conta abaixo de R$ 10k/mês

## Quando vale subir para ISP

- BM **principal** com gasto alto e histórico construído
- Conta que **já caiu** uma vez e você não pode arriscar
- Operações onde **simular usuário real** é crítico (e-commerce, social ops)
- Cliente VIP onde o custo do proxy é desprezível na operação

## Estratégia mista (o que pros fazem)

A maioria dos gestores sérios não escolhe um ou outro — **usa os dois**:

- **IPv6** para a maioria das contas: criação, aquecimento, BMs de teste
- **ISP** para 1-3 BMs principais já escaladas
- Custo total continua baixo, proteção das contas valiosas fica máxima

## E proxy rotativo?

Para Facebook/Google **nunca**. Rotativo é específico para scraping de e-commerce. BM precisa de IP **estático e exclusivo** — qualquer troca dispara verificação.

## Decisão em 1 minuto

- Está começando ou roda volume? → **IPv6 dedicado**
- BM principal escalada ou alto valor? → **ISP**
- Quer o melhor mundo? → **mix dos dois**
$PMD$,
  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1600&q=80',
  'published',
  now() - interval '21 days',
  'Proxy Residencial vs IPv6: Comparativo para Tráfego Pago',
  'Diferenças reais entre proxy residencial (ISP) e IPv6 dedicado para Facebook, Google e TikTok Ads. Quando cada um vale o investimento.',
  'proxy residencial vs ipv6',
  ARRAY['proxy residencial brasil','ipv6 ou ipv4','melhor proxy para anúncio','proxy isp','diferença proxy residencial datacenter']::text[],
  '[{"question": "Proxy residencial é sempre melhor que IPv6?", "answer": "Em detecção bruta, sim. Mas IPv6 dedicado funciona bem em 95% dos casos a 1/4 do preço. Residencial vale para BMs valiosas e operações premium."}, {"question": "ISP residencial é o mesmo que proxy mobile?", "answer": "Não. ISP é IP de banda larga residencial; mobile é IP de operadora celular (4G/5G). Mobile é ainda mais caro e raro no Brasil, usado em casos muito específicos."}, {"question": "Posso começar com IPv6 e migrar para ISP depois?", "answer": "Pode, e é a estratégia recomendada. Use IPv6 enquanto a BM aquece, e migre para ISP quando o gasto justificar (geralmente acima de R$ 15-20k/mês)."}, {"question": "Quantos sites o IPv6 não suporta hoje?", "answer": "Menos de 5% dos sites grandes. Facebook, Google, TikTok, Twitter, Instagram, Shopify, todos rodam IPv6 nativo. O problema só aparece em sistemas legados muito antigos."}]'::jsonb,
  7, 675, 'Time FastProxy',
  (SELECT id FROM public.post_categories WHERE slug = 'comparativos')
)
ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, content_md=EXCLUDED.content_md, cover_image_url=EXCLUDED.cover_image_url, meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description, keyword_primary=EXCLUDED.keyword_primary, keywords_secondary=EXCLUDED.keywords_secondary, faq=EXCLUDED.faq, reading_time_minutes=EXCLUDED.reading_time_minutes, category_id=EXCLUDED.category_id, status='published', published_at=EXCLUDED.published_at, updated_at=now();

INSERT INTO public.post_tag_map (post_id, tag_id) SELECT p.id, t.id FROM public.posts p, public.post_tags t WHERE p.slug = 'proxy-residencial-vs-ipv6-trafego-pago' AND t.slug IN ('residencial','ipv6','proxy-dedicado') ON CONFLICT DO NOTHING;