Encontrei a causa principal:

- O pedido pago do cliente é `dd99321d-1379-4a6a-b59c-5ced37cf9971`.
- No Stripe, esse Checkout está `complete` e `paid`, com assinatura ativa `sub_1Tb8dPP6qlr82aJy4ZyzKs0I`.
- No banco, o pedido ainda está `pending`, então a alocação automática não roda, porque o código só aloca quando o pedido está `paid`.
- Existe estoque disponível para IPv6 Brasil: 44 disponíveis. Portanto esse caso não precisava comprar proxy novo.
- O Checkout mais novo `3538d4fa-20f5-4063-92f4-551d86648600` ainda está `open/unpaid`, então esse não deve receber proxy.
- A compra “adoidada” vem da lógica atual de alocação: quando falta estoque ela compra pela falta do pedido, e o cron de reposição compra por regra; isso precisa virar uma única política clara: manter exatamente um bloco mínimo de 10 disponíveis, sem compras duplicadas.

Plano de correção:

1. Corrigir o cliente atual
   - Sincronizar o pedido pago do Eder com Stripe.
   - Atualizar o pedido para `paid`, salvar `stripe_subscription_id`, `stripe_customer_id` e período atual.
   - Rodar a alocação para usar 1 proxy do estoque existente.
   - Confirmar que o proxy aparece no painel do usuário.

2. Corrigir o bug de confirmação de pagamento
   - Criar uma função server-side reutilizável para reconciliar um pedido pelo `stripe_checkout_session_id` ou `order_id`.
   - Essa função vai buscar o Checkout no Stripe, validar `payment_status=paid`, atualizar o pedido e chamar a alocação.
   - Usar essa mesma função no webhook e na página `/checkout/success`, para não depender só do webhook chegar.

3. Ajustar a alocação automática
   - Se existe estoque disponível, nunca comprar novo proxy para atender pedido.
   - Se não existe estoque suficiente, alocar o que puder e deixar reposição cuidar do estoque, sem disparar compras em cascata por pedido.
   - Evitar compras concorrentes usando a trava já existente (`purchase_locks`).

4. Corrigir a política de reposição IPv6
   - Para IPv6 Brasil, manter 10 disponíveis automaticamente.
   - Quando disponível cair abaixo de 10, comprar apenas a diferença necessária para voltar a 10, respeitando bloco de IPv6.
   - Se já existir pedido pendente no provedor, primeiro consultar a API e trazer os IPs para o estoque antes de comprar outro bloco.
   - Criar/garantir a regra de reposição do produto IPv6 Brasil: mínimo 10, batch 10, ativo.

5. Validar
   - Testar com o pedido do Eder.
   - Verificar no banco: pedido `paid`, 1 alocação criada, estoque `allocated` para esse IP, estoque disponível reduzido corretamente.
   - Conferir que nenhuma compra nova foi feita enquanto ainda havia 44 disponíveis.
   - Verificar logs de Stripe/provedor para garantir que o fluxo ficou rastreável.