-- Fix: orders_stripe_ids_exposure
-- All client-facing reads of orders go through server functions using the
-- service role with explicit user scoping. The direct client SELECT policy
-- is unused and exposes Stripe identifiers (checkout session, payment intent,
-- subscription, customer ids). Drop it so clients can no longer read the
-- orders table directly. Admin policy "Admin gerencia pedidos" is kept.
DROP POLICY IF EXISTS "Cliente vê pedidos próprios" ON public.orders;

-- Fix: post_comments_user_id_enumeration
-- Anonymous visitors do not need user_id of comment authors. The public
-- listing server function (listComments) only returns display name/avatar,
-- never user_id. Revoke column-level SELECT on user_id from anon so a hand-
-- crafted public query cannot enumerate author UUIDs. Authenticated users
-- and service_role retain full access for moderation/edit flows.
REVOKE SELECT (user_id) ON public.post_comments FROM anon;

-- Fix: stripe_events_realtime_leak
-- Remove the stripe_events table from the Realtime publication so its
-- financial payloads are not broadcast to subscribed clients. The admin
-- Stripe dashboard already polls every 30s via TanStack Query, so live
-- updates remain. RLS on the table (is_staff only) is unchanged.
ALTER PUBLICATION supabase_realtime DROP TABLE public.stripe_events;