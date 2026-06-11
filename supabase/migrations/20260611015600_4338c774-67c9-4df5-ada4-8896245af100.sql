CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated, anon;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated, anon;

ALTER POLICY "Admin lê auditoria" ON public.audit_log
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin gerencia conversas" ON public.chat_conversations
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin gerencia mensagens" ON public.chat_messages
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin lê redemptions" ON public.coupon_redemptions
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin gerencia cupons" ON public.coupons
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin gerencia alocações" ON public.customer_proxies
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Cliente vê próprios proxies" ON public.customer_proxies
  USING ((auth.uid() = user_id) OR app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin lê fx_rates" ON public.fx_rates
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin gerencia notificações" ON public.notifications
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Cliente vê próprias notificações" ON public.notifications
  USING ((auth.uid() = user_id) OR app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin gerencia pedidos" ON public.orders
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Cliente vê pedidos próprios" ON public.orders
  USING ((auth.uid() = user_id) OR app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Comentários visíveis públicos" ON public.post_comments
  USING ((status = 'visible'::public.comment_status) OR (auth.uid() = user_id) OR app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin gerencia pricing_rules" ON public.pricing_rules
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin gerencia produtos" ON public.products
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Catálogo público" ON public.products
  USING ((active = true) OR app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin atualiza qualquer perfil" ON public.profiles
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Usuários veem o próprio perfil" ON public.profiles
  USING ((auth.uid() = user_id) OR app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin lê balance snapshots" ON public.provider_balance_snapshots
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin vê provedor" ON public.provider_orders
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin gerencia provider_settings" ON public.provider_settings
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin lê health events" ON public.proxy_health_events
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin lê todas as métricas" ON public.proxy_metrics
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin gerencia estoque" ON public.proxy_stock
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin gerencia purchase_locks" ON public.purchase_locks
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Cliente gerencia suas push subs" ON public.push_subscriptions
  USING ((auth.uid() = user_id) OR app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK ((auth.uid() = user_id) OR app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admin regras reposição" ON public.restock_rules
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Apenas admin gerencia roles" ON public.user_roles
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Usuários veem suas próprias roles" ON public.user_roles
  USING ((auth.uid() = user_id) OR app_private.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated, anon;