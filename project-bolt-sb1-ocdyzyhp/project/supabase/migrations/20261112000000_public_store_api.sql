/*
  # Public store API (Path B)

  The online store (khagi-kala-ecommerce) talks to this database ONLY through the four
  functions below. No table is opened to the anon role.

  1. public_list_catalog()                      - safe product list (no cost, no wholesale, no stock numbers)
  2. public_place_order(customer, items, pay)   - validates, prices and stock-checks on the server,
                                                  creates a DRAFT order. Stock is NOT cut here;
                                                  it is cut when staff runs confirm_order().
  3. public_track_order(order_number, phone)    - status of one order, needs both order number and phone
  4. public_attach_screenshot(order, phone, path) - links an uploaded payment screenshot to the order

  New table: online_order_details (shipping address, delivery charge, UPI/COD, UTR, screenshot path).
  Existing tables, triggers and functions are not changed.

  Notes
  - Delivery charge rule lives in public_place_order (constants c_delivery_charge / c_free_delivery_from).
    Keep them equal to SITE_CONFIG in the store.
  - Prices are treated as final (tax 0), same as the store shows today.
  - Spam guards: max 3 online orders per phone per hour, max 100 per hour overall.
  - Screenshots go to a PRIVATE bucket; only admin/sales can read them.
*/

-- ---------------------------------------------------------------------------
-- 1. Extra details for orders that come from the website
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS online_order_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  customer_name text NOT NULL,
  customer_phone text NOT NULL CHECK (customer_phone ~ '^[0-9]{10}$'),
  customer_email text,
  shipping_address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  pincode text NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
  delivery_charge numeric(10,2) NOT NULL DEFAULT 0 CHECK (delivery_charge >= 0),
  payment_method text NOT NULL CHECK (payment_method IN ('UPI', 'COD')),
  utr_number text,
  screenshot_path text,
  fulfilment_status text NOT NULL DEFAULT 'received'
    CHECK (fulfilment_status IN ('received', 'packed', 'shipped', 'delivered')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_online_details_phone_created
  ON online_order_details (customer_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_details_created
  ON online_order_details (created_at DESC);

DROP TRIGGER IF EXISTS online_order_details_set_updated_at ON online_order_details;
CREATE TRIGGER online_order_details_set_updated_at BEFORE UPDATE ON online_order_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE online_order_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON online_order_details FROM PUBLIC, anon, authenticated;
GRANT SELECT ON online_order_details TO authenticated;

DROP POLICY IF EXISTS online_order_details_select_sales_roles ON online_order_details;
CREATE POLICY online_order_details_select_sales_roles ON online_order_details FOR SELECT
  TO authenticated USING (current_app_role() IN ('admin', 'sales'));

-- ---------------------------------------------------------------------------
-- 2. Internal helper: normalise an Indian phone number to 10 digits (or NULL)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION store_normalize_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN d ~ '^[6-9][0-9]{9}$' THEN d
    WHEN d ~ '^91[6-9][0-9]{9}$' THEN substr(d, 3)
    WHEN d ~ '^0[6-9][0-9]{9}$' THEN substr(d, 2)
    ELSE NULL
  END
  FROM (SELECT regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') AS d) s
$$;

REVOKE EXECUTE ON FUNCTION store_normalize_phone(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Public catalog
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public_list_catalog()
RETURNS TABLE (
  id uuid,
  sku text,
  name text,
  category text,
  description text,
  pack_size numeric,
  pack_unit text,
  price numeric,
  in_stock boolean,
  image_path text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.sku, p.name, p.category, p.description, p.pack_size, p.pack_unit,
         p.retail_price,
         (p.stock_kg >= round(p.pack_size / CASE WHEN p.pack_unit = 'g' THEN 1000 ELSE 1 END, 3)),
         p.image_path
  FROM products p
  WHERE p.is_active
  ORDER BY p.category, p.name, p.pack_size
$$;

REVOKE EXECUTE ON FUNCTION public_list_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_list_catalog() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Place an order from the website (creates a DRAFT order)
--    p_customer: {name, phone, email?, address, city, state, pincode}
--    p_items:    [{product_id, quantity}]   (quantity = whole packs)
--    p_payment:  {method: 'UPI'|'COD', utr?: text}
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public_place_order(
  p_customer jsonb,
  p_items jsonb,
  p_payment jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_delivery_charge constant numeric := 60;
  c_free_delivery_from constant numeric := 599;
  c_max_lines constant integer := 20;
  c_max_qty constant integer := 50;
  c_max_subtotal constant numeric := 100000;

  v_name text;
  v_phone text;
  v_email text;
  v_address text;
  v_city text;
  v_state text;
  v_pincode text;
  v_method text;
  v_utr text;

  v_item jsonb;
  v_product products%ROWTYPE;
  v_product_id uuid;
  v_quantity numeric;
  v_kg numeric(12,3);
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_delivery numeric(10,2);
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;

  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_customer_id uuid;
  v_sequence bigint;
  v_order orders%ROWTYPE;
BEGIN
  -- ---- shape checks ----
  IF p_customer IS NULL OR jsonb_typeof(p_customer) <> 'object'
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR p_payment IS NULL OR jsonb_typeof(p_payment) <> 'object' THEN
    RAISE EXCEPTION 'Invalid order request' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > c_max_lines THEN
    RAISE EXCEPTION 'An order needs between 1 and % items', c_max_lines USING ERRCODE = '22023';
  END IF;

  -- ---- customer fields ----
  v_name    := btrim(coalesce(p_customer->>'name', ''));
  v_phone   := store_normalize_phone(p_customer->>'phone');
  v_email   := nullif(btrim(coalesce(p_customer->>'email', '')), '');
  v_address := btrim(coalesce(p_customer->>'address', ''));
  v_city    := btrim(coalesce(p_customer->>'city', ''));
  v_state   := btrim(coalesce(p_customer->>'state', ''));
  v_pincode := btrim(coalesce(p_customer->>'pincode', ''));

  IF char_length(v_name) < 2 OR char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'Please enter your full name' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Please enter a valid 10-digit mobile number' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NOT NULL AND (char_length(v_email) > 120 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
    RAISE EXCEPTION 'Please enter a valid email address' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_address) < 5 OR char_length(v_address) > 300 THEN
    RAISE EXCEPTION 'Please enter a complete delivery address' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_city) < 2 OR char_length(v_city) > 80 THEN
    RAISE EXCEPTION 'Please enter your city' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_state) < 2 OR char_length(v_state) > 60 THEN
    RAISE EXCEPTION 'Please enter your state' USING ERRCODE = '22023';
  END IF;
  IF v_pincode !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Please enter a valid 6-digit pincode' USING ERRCODE = '22023';
  END IF;

  -- ---- payment ----
  v_method := upper(btrim(coalesce(p_payment->>'method', '')));
  IF v_method NOT IN ('UPI', 'COD') THEN
    RAISE EXCEPTION 'Payment method must be UPI or COD' USING ERRCODE = '22023';
  END IF;
  IF v_method = 'UPI' THEN
    v_utr := btrim(coalesce(p_payment->>'utr', ''));
    IF v_utr !~ '^[A-Za-z0-9]{8,30}$' THEN
      RAISE EXCEPTION 'Please enter a valid UTR / transaction number' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_utr := NULL;
  END IF;

  -- ---- spam guards (serialised so the counts are reliable) ----
  PERFORM pg_advisory_xact_lock(hashtext('public_place_order'));
  IF (SELECT count(*) FROM online_order_details
      WHERE customer_phone = v_phone AND created_at > now() - interval '1 hour') >= 3 THEN
    RAISE EXCEPTION 'Too many orders from this number. Please try again later or call us.'
      USING ERRCODE = '54000';
  END IF;
  IF (SELECT count(*) FROM online_order_details
      WHERE created_at > now() - interval '1 hour') >= 100 THEN
    RAISE EXCEPTION 'We are receiving too many orders right now. Please try again shortly.'
      USING ERRCODE = '54000';
  END IF;

  -- ---- duplicate lines ----
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS a(value, ordinal)
    JOIN jsonb_array_elements(p_items) WITH ORDINALITY AS b(value, ordinal)
      ON a.ordinal < b.ordinal
     AND a.value->>'product_id' = b.value->>'product_id'
  ) THEN
    RAISE EXCEPTION 'Duplicate products in the cart are not allowed' USING ERRCODE = '22023';
  END IF;

  -- ---- price + stock check, all from the database (client price is never used) ----
  FOR v_item IN SELECT item FROM jsonb_array_elements(p_items) AS items(item) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item->'product_id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number'
       OR coalesce((v_item->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Each item needs a product and a quantity' USING ERRCODE = '22023';
    END IF;
    v_product_id := (v_item->>'product_id')::uuid;
    BEGIN
      v_quantity := (v_item->>'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Item quantity is invalid' USING ERRCODE = '22023';
    END;
    IF v_quantity < 1 OR v_quantity > c_max_qty OR v_quantity <> trunc(v_quantity) THEN
      RAISE EXCEPTION 'Quantity must be a whole number between 1 and %', c_max_qty USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_product FROM products WHERE id = v_product_id AND is_active FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A product in your cart is no longer available' USING ERRCODE = 'P0002';
    END IF;

    v_kg := round(v_quantity * v_product.pack_size / CASE WHEN v_product.pack_unit = 'g' THEN 1000 ELSE 1 END, 3);
    IF v_kg <= 0 THEN
      RAISE EXCEPTION 'Invalid pack size for %', v_product.name USING ERRCODE = '22023';
    END IF;
    IF v_product.stock_kg < v_kg THEN
      RAISE EXCEPTION 'Sorry, % is out of stock for the quantity you chose', v_product.name
        USING ERRCODE = 'P0001';
    END IF;

    v_line_total := round(v_quantity * v_product.retail_price, 2);
    v_subtotal := round(v_subtotal + v_line_total, 2);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id, 'sku', v_product.sku, 'name', v_product.name,
      'pack_size', v_product.pack_size, 'pack_unit', v_product.pack_unit,
      'quantity', v_quantity, 'unit_price', v_product.retail_price,
      'line_total', v_line_total, 'kg', v_kg
    ));
  END LOOP;

  IF v_subtotal <= 0 OR v_subtotal > c_max_subtotal THEN
    RAISE EXCEPTION 'Order amount is outside the allowed range. Please contact us for large orders.'
      USING ERRCODE = '22023';
  END IF;

  v_delivery := CASE WHEN v_subtotal >= c_free_delivery_from THEN 0 ELSE c_delivery_charge END;

  -- ---- customer: reuse by phone, otherwise create (existing customer is never modified) ----
  SELECT id INTO v_customer_id
  FROM customers
  WHERE phone = v_phone AND is_active
  ORDER BY created_at
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO customers (name, phone, city_village, address, notes)
    VALUES (v_name, v_phone, v_city, v_address, 'Created from online store')
    RETURNING id INTO v_customer_id;
  END IF;

  -- ---- order number (same format as staff app) ----
  v_sequence := nextval('public.order_number_seq');
  IF v_sequence > 99999 THEN
    RAISE EXCEPTION 'Online ordering is temporarily unavailable. Please contact us.' USING ERRCODE = '22003';
  END IF;

  INSERT INTO orders (
    order_number, customer_id, status, order_date, subtotal, discount_amount, tax_percent,
    tax_amount, total, paid_amount, payment_status, notes
  )
  VALUES (
    'KKA-' || to_char(v_today, 'YY') || '-' || lpad(v_sequence::text, 5, '0'),
    v_customer_id, 'draft', v_today, v_subtotal, 0, 0, 0, v_subtotal, 0, 'unpaid',
    'Online store order (' || v_method || ')'
  )
  RETURNING * INTO v_order;

  FOR v_line IN SELECT l FROM jsonb_array_elements(v_lines) AS t(l) LOOP
    INSERT INTO order_items (
      order_id, product_id, sku, product_name, pack_size, pack_unit,
      sale_type, quantity, unit_price, line_total, kg_equivalent
    )
    VALUES (
      v_order.id, (v_line->>'product_id')::uuid, v_line->>'sku', v_line->>'name',
      (v_line->>'pack_size')::numeric, v_line->>'pack_unit',
      'retail', (v_line->>'quantity')::numeric, (v_line->>'unit_price')::numeric,
      (v_line->>'line_total')::numeric, (v_line->>'kg')::numeric
    );
  END LOOP;

  INSERT INTO online_order_details (
    order_id, customer_name, customer_phone, customer_email, shipping_address,
    city, state, pincode, delivery_charge, payment_method, utr_number
  )
  VALUES (
    v_order.id, v_name, v_phone, v_email, v_address,
    v_city, v_state, v_pincode, v_delivery, v_method, v_utr
  );

  INSERT INTO audit_log (action, entity, entity_id, new_values)
  VALUES (
    'online_order_placed', 'order', v_order.id::text,
    jsonb_build_object(
      'order_number', v_order.order_number, 'total', v_order.total,
      'delivery_charge', v_delivery, 'payment_method', v_method
    )
  );

  RETURN jsonb_build_object(
    'order_number', v_order.order_number,
    'subtotal', v_subtotal,
    'delivery_charge', v_delivery,
    'amount_payable', round(v_subtotal + v_delivery, 2),
    'payment_method', v_method,
    'items', (
      SELECT jsonb_agg(jsonb_build_object(
        'name', l->>'name', 'pack_size', l->'pack_size', 'pack_unit', l->>'pack_unit',
        'quantity', l->'quantity', 'unit_price', l->'unit_price', 'line_total', l->'line_total'
      ))
      FROM jsonb_array_elements(v_lines) AS t(l)
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public_place_order(jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_place_order(jsonb, jsonb, jsonb) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Track an order: needs BOTH the order number and the full phone number.
--    Wrong number or wrong code gives the same answer (NULL).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public_track_order(p_order_number text, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_order_number, '')));
  v_phone text := store_normalize_phone(p_phone);
  v_result jsonb;
BEGIN
  IF v_phone IS NULL OR v_code !~ '^KKA-[0-9]{2}-[0-9]{5}$' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'order_number', o.order_number,
    'placed_on', o.order_date,
    'status', CASE
      WHEN o.status = 'cancelled' THEN 'cancelled'
      WHEN o.status = 'draft' THEN 'received'
      WHEN d.fulfilment_status = 'received' THEN 'confirmed'
      ELSE d.fulfilment_status
    END,
    'payment_status', o.payment_status,
    'payment_method', d.payment_method,
    'subtotal', o.subtotal,
    'delivery_charge', d.delivery_charge,
    'amount_payable', round(o.total + d.delivery_charge, 2),
    'city', d.city,
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'name', oi.product_name, 'pack_size', oi.pack_size, 'pack_unit', oi.pack_unit,
        'quantity', oi.quantity, 'line_total', oi.line_total
      ) ORDER BY oi.product_name)
      FROM order_items oi WHERE oi.order_id = o.id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM orders o
  JOIN online_order_details d ON d.order_id = o.id
  WHERE o.order_number = v_code AND d.customer_phone = v_phone;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public_track_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_track_order(text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Private bucket for payment screenshots
--    Upload path must be:  <ORDER NUMBER>/<uuid>.<webp|jpg|png>
--    Anyone may upload (no read-back); only admin/sales may read.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-screenshots', 'payment-screenshots', false, 2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "payment_screenshots_public_insert" ON storage.objects;
CREATE POLICY "payment_screenshots_public_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'payment-screenshots'
    AND name ~ '^KKA-[0-9]{2}-[0-9]{5}/[0-9a-f-]{36}\.(webp|jpg|png)$'
  );

DROP POLICY IF EXISTS "payment_screenshots_staff_select" ON storage.objects;
CREATE POLICY "payment_screenshots_staff_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-screenshots'
    AND public.current_app_role() IN ('admin', 'sales')
  );

-- ---------------------------------------------------------------------------
-- 7. Link an uploaded screenshot to its order (once only, phone must match)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public_attach_screenshot(
  p_order_number text,
  p_phone text,
  p_path text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_order_number, '')));
  v_phone text := store_normalize_phone(p_phone);
  v_updated integer;
BEGIN
  IF v_phone IS NULL
     OR v_code !~ '^KKA-[0-9]{2}-[0-9]{5}$'
     OR p_path IS NULL
     OR p_path !~ '^KKA-[0-9]{2}-[0-9]{5}/[0-9a-f-]{36}\.(webp|jpg|png)$'
     OR split_part(p_path, '/', 1) <> v_code THEN
    RETURN false;
  END IF;

  UPDATE online_order_details d
  SET screenshot_path = p_path
  FROM orders o
  WHERE d.order_id = o.id
    AND o.order_number = v_code
    AND d.customer_phone = v_phone
    AND d.screenshot_path IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public_attach_screenshot(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_attach_screenshot(text, text, text) TO anon, authenticated;
