CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1;
REVOKE ALL ON SEQUENCE order_number_seq FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  phone text CHECK (phone IS NULL OR phone ~ '^[0-9]{10}$'),
  city_village text,
  address text,
  gstin text CHECK (
    gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
  ),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_lower_name ON customers (lower(name));

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE CHECK (order_number ~ '^KKA-[0-9]{2}-[0-9]{5}$'),
  customer_id uuid NOT NULL REFERENCES customers(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  order_date date NOT NULL DEFAULT current_date,
  subtotal numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (tax_percent BETWEEN 0 AND 28),
  tax_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  paid_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0 AND paid_amount <= total),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  notes text,
  cancelled_at timestamptz,
  cancel_reason text,
  confirmed_at timestamptz,
  created_by uuid DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_discount_within_subtotal CHECK (discount_amount <= subtotal)
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_date ON orders (customer_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders (status, order_date DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sku text NOT NULL,
  product_name text NOT NULL,
  pack_size numeric(10,2) NOT NULL CHECK (pack_size > 0),
  pack_unit text NOT NULL CHECK (pack_unit IN ('g', 'kg')),
  sale_type text NOT NULL CHECK (sale_type IN ('retail', 'wholesale')),
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
  kg_equivalent numeric(12,3) NOT NULL CHECK (kg_equivalent > 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items (product_id);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash', 'upi', 'bank_transfer', 'cheque')),
  reference text,
  paid_on date NOT NULL DEFAULT current_date,
  voided_at timestamptz,
  voided_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  void_reason text,
  created_by uuid DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_paid_on ON payments (order_id, paid_on DESC);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON customers, orders, order_items, payments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON customers TO authenticated;
GRANT SELECT ON orders, order_items, payments TO authenticated;

DROP POLICY IF EXISTS customers_select_sales_roles ON customers;
CREATE POLICY customers_select_sales_roles ON customers FOR SELECT
  TO authenticated USING (current_app_role() IN ('admin', 'sales'));

DROP POLICY IF EXISTS customers_insert_sales_roles ON customers;
CREATE POLICY customers_insert_sales_roles ON customers FOR INSERT
  TO authenticated WITH CHECK (current_app_role() IN ('admin', 'sales'));

DROP POLICY IF EXISTS customers_update_sales_roles ON customers;
CREATE POLICY customers_update_sales_roles ON customers FOR UPDATE
  TO authenticated USING (current_app_role() IN ('admin', 'sales'))
  WITH CHECK (current_app_role() IN ('admin', 'sales'));

DROP POLICY IF EXISTS orders_select_sales_roles ON orders;
CREATE POLICY orders_select_sales_roles ON orders FOR SELECT
  TO authenticated USING (current_app_role() IN ('admin', 'sales'));

DROP POLICY IF EXISTS order_items_select_sales_roles ON order_items;
CREATE POLICY order_items_select_sales_roles ON order_items FOR SELECT
  TO authenticated USING (current_app_role() IN ('admin', 'sales'));

DROP POLICY IF EXISTS payments_select_sales_roles ON payments;
CREATE POLICY payments_select_sales_roles ON payments FOR SELECT
  TO authenticated USING (current_app_role() IN ('admin', 'sales'));

CREATE OR REPLACE FUNCTION audit_customers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (action, entity, entity_id, old_values, new_values, created_by)
    VALUES (
      'customer_created',
      'customer',
      NEW.id::text,
      NULL,
      to_jsonb(NEW) - 'created_at' - 'updated_at' - 'created_by',
      auth.uid()
    );
    RETURN NEW;
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    v_action := CASE WHEN NEW.is_active THEN 'customer_reactivated' ELSE 'customer_deactivated' END;
    INSERT INTO audit_log (action, entity, entity_id, old_values, new_values, created_by)
    VALUES (
      v_action,
      'customer',
      NEW.id::text,
      jsonb_build_object('is_active', OLD.is_active),
      jsonb_build_object('is_active', NEW.is_active),
      auth.uid()
    );
  END IF;

  IF ROW(NEW.name, NEW.phone, NEW.city_village, NEW.address, NEW.gstin, NEW.notes)
     IS DISTINCT FROM
     ROW(OLD.name, OLD.phone, OLD.city_village, OLD.address, OLD.gstin, OLD.notes) THEN
    INSERT INTO audit_log (action, entity, entity_id, old_values, new_values, created_by)
    VALUES (
      'customer_updated',
      'customer',
      NEW.id::text,
      jsonb_build_object(
        'name', OLD.name, 'phone', OLD.phone, 'city_village', OLD.city_village,
        'address', OLD.address, 'gstin', OLD.gstin, 'notes', OLD.notes
      ),
      jsonb_build_object(
        'name', NEW.name, 'phone', NEW.phone, 'city_village', NEW.city_village,
        'address', NEW.address, 'gstin', NEW.gstin, 'notes', NEW.notes
      ),
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION audit_customers() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customers_set_updated_at ON customers;
CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS customers_audit_master_data ON customers;
CREATE TRIGGER customers_audit_master_data AFTER INSERT OR UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION audit_customers();

CREATE OR REPLACE FUNCTION guard_order_mutations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'order_items'
       AND current_setting('app.order_rpc', true) = 'on'
       AND EXISTS (
         SELECT 1 FROM orders WHERE id = OLD.order_id AND status = 'draft'
       ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Hard deletion is not allowed for %', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  IF current_setting('app.order_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Changes to % must be made through an order RPC', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION guard_order_mutations() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_guard_mutations ON orders;
CREATE TRIGGER orders_guard_mutations BEFORE UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION guard_order_mutations();

DROP TRIGGER IF EXISTS order_items_guard_mutations ON order_items;
CREATE TRIGGER order_items_guard_mutations BEFORE UPDATE OR DELETE ON order_items
  FOR EACH ROW EXECUTE FUNCTION guard_order_mutations();

DROP TRIGGER IF EXISTS payments_guard_mutations ON payments;
CREATE TRIGGER payments_guard_mutations BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION guard_order_mutations();

DROP TRIGGER IF EXISTS orders_set_updated_at ON orders;
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION save_order_draft(
  p_order_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_discount numeric,
  p_tax_percent numeric,
  p_notes text,
  p_order_date date
)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_order orders%ROWTYPE;
  v_product products%ROWTYPE;
  v_item jsonb;
  v_product_id uuid;
  v_sale_type text;
  v_quantity numeric;
  v_unit_price numeric(10,2);
  v_kg_equivalent numeric(12,3);
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2);
  v_tax_percent numeric(5,2);
  v_tax_amount numeric(12,2);
  v_total numeric(12,2);
  v_count integer;
  v_sequence bigint;
  v_old_values jsonb;
BEGIN
  v_role := current_app_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'sales') THEN
    RAISE EXCEPTION 'Only admin or sales can save orders' USING ERRCODE = '42501';
  END IF;
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'A customer is required' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Order items must be a JSON array' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count > 50 THEN
    RAISE EXCEPTION 'An order can contain at most 50 lines' USING ERRCODE = '22023';
  END IF;
  IF p_discount IS NULL OR p_tax_percent IS NULL
     OR p_discount::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_tax_percent::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Discount and tax percentage are required finite numbers' USING ERRCODE = '22023';
  END IF;
  IF p_discount < 0 OR p_discount > 9999999999.99 THEN
    RAISE EXCEPTION 'Discount must be between 0 and 9999999999.99' USING ERRCODE = '22023';
  END IF;
  IF p_tax_percent < 0 OR p_tax_percent > 28 THEN
    RAISE EXCEPTION 'Tax percentage must be between 0 and 28' USING ERRCODE = '22023';
  END IF;
  v_discount := round(p_discount, 2);
  v_tax_percent := round(p_tax_percent, 2);
  IF p_tax_percent IS DISTINCT FROM v_tax_percent THEN
    RAISE EXCEPTION 'Tax percentage can have at most two decimal places' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id AND is_active) THEN
    RAISE EXCEPTION 'Customer was not found or is inactive' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS a(value, ordinal)
    JOIN jsonb_array_elements(p_items) WITH ORDINALITY AS b(value, ordinal)
      ON a.ordinal < b.ordinal
     AND a.value->>'product_id' = b.value->>'product_id'
     AND a.value->>'sale_type' = b.value->>'sale_type'
  ) THEN
    RAISE EXCEPTION 'Duplicate product and sale type lines are not allowed' USING ERRCODE = '22023';
  END IF;

  IF p_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Order was not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_order.status <> 'draft' THEN
      RAISE EXCEPTION 'Only draft orders can be edited' USING ERRCODE = '23514';
    END IF;
    IF v_order.created_by IS DISTINCT FROM auth.uid() AND v_role <> 'admin' THEN
      RAISE EXCEPTION 'Only the order creator or an admin can edit this draft' USING ERRCODE = '42501';
    END IF;
    v_old_values := jsonb_build_object(
      'customer_id', v_order.customer_id,
      'subtotal', v_order.subtotal,
      'discount_amount', v_order.discount_amount,
      'tax_percent', v_order.tax_percent,
      'tax_amount', v_order.tax_amount,
      'total', v_order.total,
      'notes', v_order.notes
    );
  END IF;

  FOR v_item IN SELECT item FROM jsonb_array_elements(p_items) AS items(item) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item->'product_id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_item->'sale_type') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number'
       OR coalesce((v_item->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Each item needs a valid product_id, sale_type, and numeric quantity' USING ERRCODE = '22023';
    END IF;
    v_product_id := (v_item->>'product_id')::uuid;
    v_sale_type := v_item->>'sale_type';
    BEGIN
      v_quantity := (v_item->>'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Item quantity is invalid or out of range' USING ERRCODE = '22023';
    END;
    IF v_sale_type IS NULL OR v_quantity IS NULL THEN
      RAISE EXCEPTION 'Each item needs a valid product_id, sale_type, and numeric quantity' USING ERRCODE = '22023';
    END IF;
    IF v_quantity <= 0 OR v_quantity > 999999999.999 THEN
      RAISE EXCEPTION 'Item quantity must be greater than zero and within the supported range' USING ERRCODE = '22023';
    END IF;
    IF v_quantity <> round(v_quantity, 3) THEN
      RAISE EXCEPTION 'Item quantity can have at most three decimal places' USING ERRCODE = '22023';
    END IF;
    IF v_sale_type NOT IN ('retail', 'wholesale') THEN
      RAISE EXCEPTION 'Sale type must be retail or wholesale' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_product
    FROM products
    WHERE id = v_product_id AND is_active
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % was not found or is inactive', v_product_id USING ERRCODE = 'P0002';
    END IF;

    IF v_sale_type = 'retail' THEN
      IF v_quantity <> trunc(v_quantity) THEN
        RAISE EXCEPTION 'Retail quantity must be a whole number of packs for %', v_product.name
          USING ERRCODE = '22023';
      END IF;
      v_unit_price := v_product.retail_price;
      v_kg_equivalent := round(
        v_quantity * v_product.pack_size / CASE WHEN v_product.pack_unit = 'g' THEN 1000 ELSE 1 END,
        3
      );
    ELSE
      v_unit_price := v_product.wholesale_price;
      v_kg_equivalent := round(v_quantity, 3);
    END IF;
    IF v_kg_equivalent <= 0 THEN
      RAISE EXCEPTION 'Quantity for % is too small to represent in kilograms', v_product.name
        USING ERRCODE = '22023';
    END IF;
    v_line_total := round(v_quantity * v_unit_price, 2);
    v_subtotal := round(v_subtotal + v_line_total, 2);

  END LOOP;

  IF p_discount IS DISTINCT FROM round(p_discount, 2) THEN
    RAISE EXCEPTION 'Discount can have at most two decimal places' USING ERRCODE = '22023';
  END IF;
  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'Discount cannot exceed the order subtotal' USING ERRCODE = '22023';
  END IF;
  IF v_role = 'sales' AND v_discount > round(v_subtotal * 0.10, 2) THEN
    RAISE EXCEPTION 'Sales staff discount cannot exceed 10 percent of the subtotal' USING ERRCODE = '42501';
  END IF;
  v_tax_amount := round((v_subtotal - v_discount) * v_tax_percent / 100, 2);
  v_total := round(v_subtotal - v_discount + v_tax_amount, 2);

  IF p_order_id IS NULL THEN
    v_sequence := nextval('public.order_number_seq');
    IF v_sequence > 99999 THEN
      RAISE EXCEPTION 'The order number sequence for this deployment has reached its limit' USING ERRCODE = '22003';
    END IF;
    INSERT INTO orders (
      order_number, customer_id, status, order_date, subtotal, discount_amount, tax_percent,
      tax_amount, total, paid_amount, payment_status, notes, created_by
    )
    VALUES (
      'KKA-' || to_char(coalesce(p_order_date, current_date), 'YY') || '-' || lpad(v_sequence::text, 5, '0'),
      p_customer_id, 'draft', coalesce(p_order_date, current_date), v_subtotal, v_discount,
      v_tax_percent, v_tax_amount, v_total, 0, 'unpaid', p_notes, auth.uid()
    )
    RETURNING * INTO v_order;

    INSERT INTO audit_log (action, entity, entity_id, new_values, created_by)
    VALUES (
      'order_created', 'order', v_order.id::text,
      jsonb_build_object('order_number', v_order.order_number, 'customer_id', v_order.customer_id, 'total', v_order.total),
      auth.uid()
    );
  ELSE
    PERFORM set_config('app.order_rpc', 'on', true);
    DELETE FROM order_items WHERE order_id = p_order_id;
    UPDATE orders
    SET customer_id = p_customer_id,
        order_date = coalesce(p_order_date, order_date),
        subtotal = v_subtotal,
        discount_amount = v_discount,
        tax_percent = v_tax_percent,
        tax_amount = v_tax_amount,
        total = v_total,
        notes = p_notes
    WHERE id = p_order_id
    RETURNING * INTO v_order;
    INSERT INTO audit_log (action, entity, entity_id, old_values, new_values, created_by)
    VALUES (
      'order_draft_updated', 'order', v_order.id::text, v_old_values,
      jsonb_build_object('customer_id', v_order.customer_id, 'subtotal', v_order.subtotal, 'discount_amount', v_order.discount_amount, 'tax_percent', v_order.tax_percent, 'tax_amount', v_order.tax_amount, 'total', v_order.total, 'notes', v_order.notes),
      auth.uid()
    );
  END IF;

  FOR v_item IN SELECT item FROM jsonb_array_elements(p_items) AS items(item) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_sale_type := v_item->>'sale_type';
    v_quantity := (v_item->>'quantity')::numeric;
    SELECT * INTO v_product FROM products WHERE id = v_product_id AND is_active FOR SHARE;
    IF v_sale_type = 'retail' THEN
      v_unit_price := v_product.retail_price;
      v_kg_equivalent := round(
        v_quantity * v_product.pack_size / CASE WHEN v_product.pack_unit = 'g' THEN 1000 ELSE 1 END,
        3
      );
    ELSE
      v_unit_price := v_product.wholesale_price;
      v_kg_equivalent := round(v_quantity, 3);
    END IF;
    INSERT INTO order_items (
      order_id, product_id, sku, product_name, pack_size, pack_unit,
      sale_type, quantity, unit_price, line_total, kg_equivalent
    )
    VALUES (
      v_order.id, v_product.id, v_product.sku, v_product.name, v_product.pack_size,
      v_product.pack_unit, v_sale_type, v_quantity, v_unit_price,
      round(v_quantity * v_unit_price, 2), v_kg_equivalent
    );
  END LOOP;

  RETURN v_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION save_order_draft(uuid, uuid, jsonb, numeric, numeric, text, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_order_draft(uuid, uuid, jsonb, numeric, numeric, text, date)
  TO authenticated;

CREATE OR REPLACE FUNCTION confirm_order(p_order_id uuid)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_order orders%ROWTYPE;
  v_item record;
BEGIN
  v_role := current_app_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'sales') THEN
    RAISE EXCEPTION 'Only admin or sales can confirm orders' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order was not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft orders can be confirmed' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'An order needs at least one item before it can be confirmed' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN
    SELECT oi.product_id, p.sku, p.name, sum(oi.kg_equivalent)::numeric(12,3) AS quantity_kg
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
    GROUP BY oi.product_id, p.sku, p.name
    ORDER BY oi.product_id
  LOOP
    BEGIN
      PERFORM record_stock_movement(
        'product', v_item.product_id, 'sale_out', v_item.quantity_kg,
        'Order ' || v_order.order_number, NULL
      );
    EXCEPTION
      WHEN SQLSTATE 'P0001' THEN
        RAISE EXCEPTION 'Insufficient stock for product % (SKU %)', v_item.name, v_item.sku
          USING ERRCODE = 'P0001';
      WHEN SQLSTATE 'P0002' THEN
        RAISE EXCEPTION 'Product % (SKU %) is inactive or unavailable', v_item.name, v_item.sku
          USING ERRCODE = 'P0002';
    END;
  END LOOP;

  PERFORM set_config('app.order_rpc', 'on', true);
  UPDATE orders SET status = 'confirmed', confirmed_at = now() WHERE id = p_order_id
  RETURNING * INTO v_order;
  INSERT INTO audit_log (action, entity, entity_id, new_values, created_by)
  VALUES (
    'order_confirmed', 'order', v_order.id::text,
    jsonb_build_object('order_number', v_order.order_number, 'status', v_order.status, 'total', v_order.total),
    auth.uid()
  );
  RETURN v_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION confirm_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION confirm_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION cancel_order(p_order_id uuid, p_reason text)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_order orders%ROWTYPE;
  v_item record;
BEGIN
  v_role := current_app_role();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an admin can cancel orders' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A cancellation reason is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order was not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.status NOT IN ('draft', 'confirmed') THEN
    RAISE EXCEPTION 'Only draft or confirmed orders can be cancelled' USING ERRCODE = '23514';
  END IF;
  IF v_order.paid_amount > 0 THEN
    RAISE EXCEPTION 'Void payments first before cancelling this order' USING ERRCODE = '23514';
  END IF;

  IF v_order.status = 'confirmed' THEN
    FOR v_item IN
      SELECT oi.product_id, p.sku, p.name, sum(oi.kg_equivalent)::numeric(12,3) AS quantity_kg
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = p_order_id
      GROUP BY oi.product_id, p.sku, p.name
      ORDER BY oi.product_id
    LOOP
      BEGIN
        PERFORM record_stock_movement(
          'product', v_item.product_id, 'return_in', v_item.quantity_kg,
          'Order ' || v_order.order_number || ' cancelled', NULL
        );
      EXCEPTION
        WHEN SQLSTATE 'P0002' THEN
          RAISE EXCEPTION 'Product % (SKU %) is inactive or unavailable; reactivate it before cancelling', v_item.name, v_item.sku
            USING ERRCODE = 'P0002';
      END;
    END LOOP;
  END IF;

  PERFORM set_config('app.order_rpc', 'on', true);
  UPDATE orders
  SET status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason)
  WHERE id = p_order_id
  RETURNING * INTO v_order;
  INSERT INTO audit_log (action, entity, entity_id, reason, new_values, created_by)
  VALUES (
    'order_cancelled', 'order', v_order.id::text, btrim(p_reason),
    jsonb_build_object('order_number', v_order.order_number, 'status', v_order.status, 'cancel_reason', v_order.cancel_reason),
    auth.uid()
  );
  RETURN v_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_order(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION record_payment(
  p_order_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_paid_on date
)
RETURNS payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_order orders%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_amount numeric(12,2);
  v_paid numeric(12,2);
BEGIN
  v_role := current_app_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'sales') THEN
    RAISE EXCEPTION 'Only admin or sales can record payments' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount::text IN ('NaN', 'Infinity', '-Infinity') OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be a positive finite number' USING ERRCODE = '22023';
  END IF;
  IF p_amount > 9999999999.99 THEN
    RAISE EXCEPTION 'Payment amount exceeds the supported limit' USING ERRCODE = '22023';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('cash', 'upi', 'bank_transfer', 'cheque') THEN
    RAISE EXCEPTION 'Payment method is invalid' USING ERRCODE = '22023';
  END IF;
  v_amount := round(p_amount, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be at least 0.01' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order was not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Payments can only be recorded for confirmed orders' USING ERRCODE = '23514';
  END IF;
  IF v_amount > round(v_order.total - v_order.paid_amount, 2) THEN
    RAISE EXCEPTION 'Payment exceeds the remaining order balance' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('app.order_rpc', 'on', true);
  INSERT INTO payments (order_id, amount, method, reference, paid_on, created_by)
  VALUES (p_order_id, v_amount, p_method, NULLIF(btrim(p_reference), ''), coalesce(p_paid_on, current_date), auth.uid())
  RETURNING * INTO v_payment;
  v_paid := round(v_order.paid_amount + v_amount, 2);
  UPDATE orders
  SET paid_amount = v_paid,
      payment_status = CASE WHEN v_paid >= total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END
  WHERE id = p_order_id;
  INSERT INTO audit_log (action, entity, entity_id, new_values, created_by)
  VALUES (
    'payment_recorded', 'payment', v_payment.id::text,
    jsonb_build_object('order_id', p_order_id, 'amount', v_payment.amount, 'method', v_payment.method, 'paid_on', v_payment.paid_on),
    auth.uid()
  );
  RETURN v_payment;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_payment(uuid, numeric, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_payment(uuid, numeric, text, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION void_payment(p_payment_id uuid, p_reason text)
RETURNS payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_order_id uuid;
  v_order orders%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_paid numeric(12,2);
BEGIN
  v_role := current_app_role();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an admin can void payments' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A payment void reason is required' USING ERRCODE = '22023';
  END IF;
  SELECT order_id INTO v_order_id FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment was not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_order FROM orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment order was not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR UPDATE;
  IF v_payment.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Payment has already been voided' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('app.order_rpc', 'on', true);
  UPDATE payments
  SET voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  WHERE id = p_payment_id
  RETURNING * INTO v_payment;
  SELECT coalesce(sum(amount), 0)::numeric(12,2)
    INTO v_paid FROM payments WHERE order_id = v_order_id AND voided_at IS NULL;
  UPDATE orders
  SET paid_amount = v_paid,
      payment_status = CASE WHEN v_paid >= total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END
  WHERE id = v_order_id;
  INSERT INTO audit_log (action, entity, entity_id, reason, old_values, new_values, created_by)
  VALUES (
    'payment_voided', 'payment', v_payment.id::text, btrim(p_reason),
    jsonb_build_object('amount', v_payment.amount, 'voided_at', NULL),
    jsonb_build_object('amount', v_payment.amount, 'voided_at', v_payment.voided_at, 'void_reason', v_payment.void_reason),
    auth.uid()
  );
  RETURN v_payment;
END;
$$;

REVOKE EXECUTE ON FUNCTION void_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION void_payment(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION list_customer_balances()
RETURNS TABLE (
  customer_id uuid,
  total_billed numeric,
  total_paid numeric,
  outstanding numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_app_role() IS NULL OR current_app_role() NOT IN ('admin', 'sales') THEN
    RAISE EXCEPTION 'Only admin or sales can list customer balances' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT o.customer_id,
         round(sum(o.total), 2)::numeric AS total_billed,
         round(sum(o.paid_amount), 2)::numeric AS total_paid,
         round(sum(o.total - o.paid_amount), 2)::numeric AS outstanding
  FROM orders o
  WHERE o.status = 'confirmed'
  GROUP BY o.customer_id
  ORDER BY o.customer_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION list_customer_balances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION list_customer_balances() TO authenticated;
