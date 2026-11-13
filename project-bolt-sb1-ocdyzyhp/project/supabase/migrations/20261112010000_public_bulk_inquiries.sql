/*
  # Public bulk / B2B inquiries

  The store's "Bulk Order" form used to write to its own bulk_inquiries table.
  Now it goes through one function, public_submit_bulk_inquiry(), and the rows land
  in this database where admin/sales can read them.

  - New table: bulk_inquiries (readable only by admin/sales)
  - New function: public_submit_bulk_inquiry(p_inquiry jsonb)
  - Spam guards: max 3 inquiries per phone per hour, max 50 per hour overall
*/

CREATE TABLE IF NOT EXISTS bulk_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  phone text NOT NULL CHECK (phone ~ '^[0-9]{10}$'),
  product_required text NOT NULL,
  quantity_kg numeric(12,2) NOT NULL CHECK (quantity_kg > 0),
  business_type text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Contacted', 'Closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bulk_inquiries_created ON bulk_inquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_inquiries_phone_created ON bulk_inquiries (phone, created_at DESC);

ALTER TABLE bulk_inquiries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bulk_inquiries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON bulk_inquiries TO authenticated;

DROP POLICY IF EXISTS bulk_inquiries_select_sales_roles ON bulk_inquiries;
CREATE POLICY bulk_inquiries_select_sales_roles ON bulk_inquiries FOR SELECT
  TO authenticated USING (current_app_role() IN ('admin', 'sales'));

CREATE OR REPLACE FUNCTION public_submit_bulk_inquiry(p_inquiry jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_phone text;
  v_product text;
  v_qty numeric;
  v_type text;
  v_message text;
BEGIN
  IF p_inquiry IS NULL OR jsonb_typeof(p_inquiry) <> 'object' THEN
    RAISE EXCEPTION 'Invalid request' USING ERRCODE = '22023';
  END IF;

  v_name    := btrim(coalesce(p_inquiry->>'name', ''));
  v_phone   := store_normalize_phone(p_inquiry->>'phone');
  v_product := btrim(coalesce(p_inquiry->>'product_required', ''));
  v_type    := btrim(coalesce(p_inquiry->>'business_type', ''));
  v_message := nullif(btrim(coalesce(p_inquiry->>'message', '')), '');

  IF char_length(v_name) < 2 OR char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'Please enter your name' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Please enter a valid 10-digit mobile number' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_product) < 2 OR char_length(v_product) > 200 THEN
    RAISE EXCEPTION 'Please tell us which product you need' USING ERRCODE = '22023';
  END IF;
  IF v_type NOT IN ('Cafe', 'Hotel', 'Bakery', 'Ayurvedic Company', 'Reseller') THEN
    RAISE EXCEPTION 'Please choose a business type' USING ERRCODE = '22023';
  END IF;
  IF v_message IS NOT NULL AND char_length(v_message) > 1000 THEN
    RAISE EXCEPTION 'Message is too long' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_inquiry->'quantity_kg') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Please enter the quantity in kg' USING ERRCODE = '22023';
  END IF;
  v_qty := (p_inquiry->>'quantity_kg')::numeric;
  IF v_qty <= 0 OR v_qty > 100000 THEN
    RAISE EXCEPTION 'Please enter a quantity between 1 and 100000 kg' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public_submit_bulk_inquiry'));
  IF (SELECT count(*) FROM bulk_inquiries
      WHERE phone = v_phone AND created_at > now() - interval '1 hour') >= 3
     OR (SELECT count(*) FROM bulk_inquiries
         WHERE created_at > now() - interval '1 hour') >= 50 THEN
    RAISE EXCEPTION 'Too many requests right now. Please call us instead.' USING ERRCODE = '54000';
  END IF;

  INSERT INTO bulk_inquiries (name, phone, product_required, quantity_kg, business_type, message)
  VALUES (v_name, v_phone, v_product, v_qty, v_type, v_message);

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public_submit_bulk_inquiry(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_submit_bulk_inquiry(jsonb) TO anon, authenticated;
