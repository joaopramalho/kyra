-- Additive platform billing tables. These records are not tenant scoped so a
-- prospect can pay before manual tenant onboarding has taken place.
CREATE TABLE public.commercial_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  tenant_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  stripe_customer_id text UNIQUE,
  affiliate_profile_id uuid REFERENCES public.affiliate_profiles(id) ON DELETE SET NULL,
  commission_rate_bps integer CHECK (commission_rate_bps BETWEEN 0 AND 10000),
  onboarding_status varchar(32) NOT NULL DEFAULT 'awaiting_payment',
  internal_notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_customers_onboarding_status_check CHECK (onboarding_status IN ('awaiting_payment', 'paid_awaiting_onboarding', 'onboarded'))
);
CREATE UNIQUE INDEX commercial_customers_tenant_unique ON public.commercial_customers (tenant_id);
CREATE INDEX commercial_customers_email_idx ON public.commercial_customers (email);
CREATE INDEX commercial_customers_tenant_idx ON public.commercial_customers (tenant_id);
CREATE INDEX commercial_customers_onboarding_idx ON public.commercial_customers (onboarding_status);

CREATE TABLE public.commercial_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(64) NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  monthly_amount_cents integer NOT NULL,
  setup_amount_cents integer NOT NULL DEFAULT 0,
  lead_allowance integer,
  currency varchar(3) NOT NULL DEFAULT 'usd',
  stripe_product_id text,
  stripe_price_id text,
  visible boolean NOT NULL DEFAULT true,
  publicly_available boolean NOT NULL DEFAULT false,
  accepts_affiliate boolean NOT NULL DEFAULT false,
  allow_promotion_codes boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_plans_amounts_check CHECK (monthly_amount_cents > 0 AND setup_amount_cents >= 0),
  CONSTRAINT commercial_plans_leads_check CHECK (lead_allowance IS NULL OR lead_allowance >= 0),
  CONSTRAINT commercial_plans_currency_check CHECK (currency = 'usd')
);
CREATE INDEX commercial_plans_public_idx ON public.commercial_plans (publicly_available, visible);
CREATE TABLE public.commercial_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.commercial_customers(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  plan_name text NOT NULL,
  monthly_amount_cents integer NOT NULL,
  setup_amount_cents integer NOT NULL DEFAULT 0,
  discount_amount_cents integer NOT NULL DEFAULT 0,
  allow_promotion_codes boolean NOT NULL DEFAULT true,
  currency varchar(3) NOT NULL DEFAULT 'usd',
  lead_allowance integer,
  stripe_product_id text,
  stripe_price_id text,
  status varchar(24) NOT NULL DEFAULT 'open',
  submission_key text UNIQUE,
  expires_at timestamptz,
  checkout_session_id text UNIQUE,
  checkout_url text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_offers_status_check CHECK (status IN ('open', 'checkout_pending', 'paid', 'revoked', 'expired')),
  CONSTRAINT commercial_offers_currency_check CHECK (currency = 'usd'),
  CONSTRAINT commercial_offers_amounts_check CHECK (monthly_amount_cents > 0 AND setup_amount_cents >= 0 AND discount_amount_cents >= 0 AND discount_amount_cents < monthly_amount_cents + setup_amount_cents),
  CONSTRAINT commercial_offers_leads_check CHECK (lead_allowance IS NULL OR lead_allowance >= 0)
);
CREATE INDEX commercial_offers_status_created_idx ON public.commercial_offers (status, created_at);

CREATE TABLE public.commercial_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.commercial_customers(id) ON DELETE CASCADE,
  offer_id uuid REFERENCES public.commercial_offers(id) ON DELETE SET NULL,
  stripe_object_id text NOT NULL UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  last_stripe_event_created integer,
  kind varchar(32) NOT NULL,
  status varchar(32) NOT NULL,
  amount_cents integer NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'usd',
  description text,
  hosted_invoice_url text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_payments_amount_check CHECK (amount_cents >= 0)
);
CREATE INDEX commercial_payments_customer_time_idx ON public.commercial_payments (customer_id, occurred_at DESC);

CREATE TABLE public.commercial_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.commercial_customers(id) ON DELETE CASCADE,
  offer_id uuid REFERENCES public.commercial_offers(id) ON DELETE SET NULL,
  stripe_subscription_id text NOT NULL UNIQUE,
  plan_name text NOT NULL,
  status varchar(32) NOT NULL,
  monthly_amount_cents integer NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'usd',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  last_stripe_event_created integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_subscriptions_amount_check CHECK (monthly_amount_cents >= 0)
);
CREATE INDEX commercial_subscriptions_customer_status_idx ON public.commercial_subscriptions (customer_id, status);

ALTER TABLE public.affiliate_profiles ADD COLUMN commission_rate_bps integer NOT NULL DEFAULT 2500;
ALTER TABLE public.affiliate_profiles ADD CONSTRAINT affiliate_profiles_commission_rate_check CHECK (commission_rate_bps BETWEEN 0 AND 10_000);

CREATE TABLE public.commercial_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_profile_id uuid NOT NULL REFERENCES public.affiliate_profiles(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.commercial_customers(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.commercial_payments(id) ON DELETE CASCADE,
  source_key text NOT NULL UNIQUE,
  amount_cents integer NOT NULL,
  original_amount_cents integer NOT NULL DEFAULT 0,
  commission_rate_bps integer NOT NULL,
  commission_cents integer NOT NULL,
  original_commission_cents integer NOT NULL DEFAULT 0,
  recovered_cents integer NOT NULL DEFAULT 0,
  currency varchar(3) NOT NULL DEFAULT 'usd',
  status varchar(24) NOT NULL DEFAULT 'pending',
  clears_at timestamptz NOT NULL,
  paid_at timestamptz,
  payout_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_commissions_amounts_check CHECK (amount_cents >= 0 AND original_amount_cents >= 0 AND commission_rate_bps BETWEEN 0 AND 10_000 AND original_commission_cents >= 0 AND recovered_cents >= 0 AND recovered_cents <= abs(commission_cents) AND (commission_cents >= 0 OR status IN ('reversed', 'recovered'))),
  CONSTRAINT commercial_commissions_status_check CHECK (status IN ('pending', 'available', 'paid', 'voided', 'disputed', 'reversed', 'recovered'))
);
CREATE INDEX commercial_commissions_affiliate_status_idx ON public.commercial_commissions (affiliate_profile_id, status);
CREATE INDEX commercial_commissions_clears_idx ON public.commercial_commissions (status, clears_at);

CREATE TABLE public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'received',
  payload jsonb NOT NULL,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stripe_webhook_events_status_check CHECK (status IN ('received', 'processing', 'processed', 'failed'))
);
CREATE INDEX stripe_webhook_events_status_idx ON public.stripe_webhook_events (status, created_at);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['commercial_customers', 'commercial_plans', 'commercial_offers', 'commercial_payments', 'commercial_subscriptions', 'commercial_commissions', 'stripe_webhook_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO lobbystack_system USING (app.current_actor_type() = ''system'') WITH CHECK (app.current_actor_type() = ''system'')', table_name || '_system_access', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO lobbystack_system', table_name);
  END LOOP;
END $$;
