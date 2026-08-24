CREATE TABLE public.cs_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  item_kind text NOT NULL DEFAULT 'produto' CHECK (item_kind IN ('produto','servico')),
  item_name text NOT NULL,
  category text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_value numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'fechado' CHECK (status IN ('fechado','em_negociacao','cancelado','renovacao')),
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  period_start date,
  period_end date,
  contract_ref text,
  payment_method text,
  recurrence text NOT NULL DEFAULT 'unica' CHECK (recurrence IN ('unica','mensal','trimestral','semestral','anual')),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',
  external_key text UNIQUE,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cs_sales_client_idx ON public.cs_sales(client_uid, sale_date DESC);
CREATE INDEX cs_sales_kind_idx ON public.cs_sales(item_kind);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_sales TO authenticated;
GRANT ALL ON public.cs_sales TO service_role;

ALTER TABLE public.cs_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CS module can manage sales"
  ON public.cs_sales FOR ALL
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'cs'))
  WITH CHECK (public.can_access_module(auth.uid(), 'cs'));

CREATE OR REPLACE FUNCTION public.cs_sales_compute_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.total_value IS NULL OR NEW.total_value = 0 THEN
    NEW.total_value := GREATEST(COALESCE(NEW.quantity,1) * COALESCE(NEW.unit_value,0) - COALESCE(NEW.discount,0), 0);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER cs_sales_total BEFORE INSERT OR UPDATE ON public.cs_sales
FOR EACH ROW EXECUTE FUNCTION public.cs_sales_compute_total();

CREATE TRIGGER cs_sales_touch BEFORE UPDATE ON public.cs_sales
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();