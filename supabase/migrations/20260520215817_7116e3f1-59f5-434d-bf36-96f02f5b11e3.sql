
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name text;
CREATE INDEX IF NOT EXISTS orders_customer_email_idx ON public.orders (lower(customer_email));
