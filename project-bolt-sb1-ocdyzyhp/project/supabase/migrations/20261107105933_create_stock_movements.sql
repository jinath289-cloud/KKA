CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL CHECK (item_type IN ('product', 'raw_material')),
  item_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (
    movement_type IN (
      'opening', 'purchase_in', 'production_in', 'production_out', 'sale_out',
      'return_in', 'wastage', 'adjustment_in', 'adjustment_out'
    )
  ),
  quantity_kg numeric(12,3) NOT NULL CHECK (quantity_kg > 0),
  note text,
  vendor_id uuid REFERENCES vendors(id),
  balance_after_kg numeric(12,3) NOT NULL,
  created_by uuid DEFAULT auth.uid() REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_movements_vendor_purchase_only
    CHECK (vendor_id IS NULL OR movement_type = 'purchase_in')
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at_id
  ON stock_movements (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item
  ON stock_movements (item_type, item_id, created_at DESC, id DESC);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stock_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON stock_movements TO authenticated;

DROP POLICY IF EXISTS stock_movements_select_by_role ON stock_movements;
CREATE POLICY stock_movements_select_by_role ON stock_movements
  FOR SELECT TO authenticated
  USING (
    CASE current_app_role()
      WHEN 'admin' THEN true
      WHEN 'purchase' THEN item_type = 'raw_material' AND movement_type = 'purchase_in'
      WHEN 'store' THEN
        (item_type = 'raw_material' AND movement_type IN ('purchase_in', 'production_out', 'wastage'))
        OR (item_type = 'product' AND movement_type IN ('production_in', 'wastage'))
      WHEN 'sales' THEN item_type = 'product' AND movement_type IN ('sale_out', 'return_in')
      ELSE false
    END
  );

CREATE OR REPLACE FUNCTION prevent_direct_stock_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.stock_kg IS DISTINCT FROM OLD.stock_kg
     AND current_setting('app.stock_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Stock must be changed through record_stock_movement'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION prevent_direct_stock_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_prevent_direct_stock_update ON products;
CREATE TRIGGER products_prevent_direct_stock_update
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION prevent_direct_stock_update();

DROP TRIGGER IF EXISTS raw_materials_prevent_direct_stock_update ON raw_materials;
CREATE TRIGGER raw_materials_prevent_direct_stock_update
  BEFORE UPDATE ON raw_materials
  FOR EACH ROW EXECUTE FUNCTION prevent_direct_stock_update();

CREATE OR REPLACE FUNCTION record_stock_movement(
  p_item_type text,
  p_item_id uuid,
  p_movement_type text,
  p_quantity_kg numeric,
  p_note text DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL
)
RETURNS stock_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_current numeric(12,3);
  v_balance numeric(12,3);
  v_delta numeric(12,3);
  v_item_code text;
  v_item_name text;
  v_movement stock_movements;
BEGIN
  v_role := current_app_role();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'An active staff account is required' USING ERRCODE = '42501';
  END IF;
  IF p_item_type NOT IN ('product', 'raw_material') THEN
    RAISE EXCEPTION 'Invalid item type' USING ERRCODE = '22023';
  END IF;
  IF p_movement_type NOT IN (
    'opening', 'purchase_in', 'production_in', 'production_out', 'sale_out',
    'return_in', 'wastage', 'adjustment_in', 'adjustment_out'
  ) THEN
    RAISE EXCEPTION 'Invalid movement type' USING ERRCODE = '22023';
  END IF;
  IF p_quantity_kg IS NULL OR p_quantity_kg <= 0 OR p_quantity_kg > 999999999.999 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero and within the supported range'
      USING ERRCODE = '22023';
  END IF;

  IF v_role <> 'admin' THEN
    IF v_role = 'purchase' THEN
      IF p_item_type <> 'raw_material' OR p_movement_type <> 'purchase_in' THEN
        RAISE EXCEPTION 'This role cannot record the requested movement' USING ERRCODE = '42501';
      END IF;
    ELSIF v_role = 'store' THEN
      IF NOT (
        (p_item_type = 'raw_material' AND p_movement_type IN ('purchase_in', 'production_out', 'wastage'))
        OR (p_item_type = 'product' AND p_movement_type IN ('production_in', 'wastage'))
      ) THEN
        RAISE EXCEPTION 'This role cannot record the requested movement' USING ERRCODE = '42501';
      END IF;
    ELSIF v_role = 'sales' THEN
      IF p_item_type <> 'product' OR p_movement_type NOT IN ('sale_out', 'return_in') THEN
        RAISE EXCEPTION 'This role cannot record the requested movement' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'This role cannot record stock movements' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_movement_type IN ('adjustment_in', 'adjustment_out')
     AND (v_role <> 'admin' OR NULLIF(btrim(p_note), '') IS NULL) THEN
    RAISE EXCEPTION 'Adjustments are admin-only and require a note' USING ERRCODE = '42501';
  END IF;
  IF p_movement_type = 'opening' AND v_role <> 'admin' THEN
    RAISE EXCEPTION 'Opening stock is admin-only' USING ERRCODE = '42501';
  END IF;
  IF p_vendor_id IS NOT NULL AND p_movement_type <> 'purchase_in' THEN
    RAISE EXCEPTION 'A vendor can only be attached to a purchase receipt' USING ERRCODE = '22023';
  END IF;
  IF p_vendor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM vendors WHERE id = p_vendor_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Vendor not found or inactive' USING ERRCODE = '22023';
  END IF;

  IF p_item_type = 'product' THEN
    SELECT stock_kg, sku, name
      INTO v_current, v_item_code, v_item_name
      FROM products
      WHERE id = p_item_id AND is_active
      FOR UPDATE;
  ELSE
    SELECT stock_kg, code, name
      INTO v_current, v_item_code, v_item_name
      FROM raw_materials
      WHERE id = p_item_id AND is_active
      FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or inactive' USING ERRCODE = 'P0002';
  END IF;

  IF p_movement_type = 'opening' AND (
    v_current <> 0 OR EXISTS (
      SELECT 1 FROM stock_movements
      WHERE item_type = p_item_type AND item_id = p_item_id
    )
  ) THEN
    RAISE EXCEPTION 'Opening stock can only be recorded once on an empty item'
      USING ERRCODE = '23514';
  END IF;

  v_delta := CASE
    WHEN p_movement_type IN ('opening', 'purchase_in', 'production_in', 'return_in', 'adjustment_in')
      THEN p_quantity_kg
    ELSE -p_quantity_kg
  END;
  v_balance := v_current + v_delta;
  IF v_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient stock' USING ERRCODE = 'P0001';
  END IF;
  IF v_balance > 999999999.999 THEN
    RAISE EXCEPTION 'Stock exceeds the supported range' USING ERRCODE = '22003';
  END IF;

  PERFORM set_config('app.stock_rpc', 'on', true);
  IF p_item_type = 'product' THEN
    UPDATE products SET stock_kg = v_balance WHERE id = p_item_id;
  ELSE
    UPDATE raw_materials SET stock_kg = v_balance WHERE id = p_item_id;
  END IF;

  INSERT INTO stock_movements (
    item_type, item_id, movement_type, quantity_kg, note, vendor_id, balance_after_kg, created_by
  )
  VALUES (
    p_item_type, p_item_id, p_movement_type, p_quantity_kg, NULLIF(btrim(p_note), ''),
    p_vendor_id, v_balance, auth.uid()
  )
  RETURNING * INTO v_movement;

  INSERT INTO audit_log (action, entity, entity_id, new_values, created_by)
  VALUES (
    'stock_movement_recorded',
    'stock_movement',
    v_movement.id::text,
    jsonb_build_object(
      'item_type', p_item_type,
      'item_id', p_item_id,
      'item_code', v_item_code,
      'item_name', v_item_name,
      'movement_type', p_movement_type,
      'quantity_kg', p_quantity_kg,
      'balance_after_kg', v_balance,
      'vendor_id', p_vendor_id,
      'note', NULLIF(btrim(p_note), '')
    ),
    auth.uid()
  );

  RETURN v_movement;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_stock_movement(text, uuid, text, numeric, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_stock_movement(text, uuid, text, numeric, text, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION list_stock_vendors()
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, v.name
  FROM vendors v
  WHERE v.is_active
    AND current_app_role() IN ('admin', 'purchase', 'store')
  ORDER BY v.name
$$;

REVOKE EXECUTE ON FUNCTION list_stock_vendors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION list_stock_vendors() TO authenticated;
