/*
# Product catalog, raw materials and vendors (with demo seed)

## Plain-English summary
Adds the master lists the plant runs on: finished dehydrated products, raw materials bought from farmers, and the vendors who supply them. Loads the initial catalog so the Product Catalog and stock screens show real data on first open.

## 1. New tables
- `products`: finished goods. SKU, name, category, description, pack size (grams), retail price per pack, wholesale price per kg, stock in kg, low-stock limit in kg, active flag, audit columns.
- `raw_materials`: raw inputs. Code, name, cost per kg, stock in kg, low-stock limit in kg, active flag, audit columns.
- `vendors`: suppliers. Name, type (farmer / shg / local_producer / trader), contact person, 10-digit phone, village or cluster, address, UPI ID, supplied items, ID verification flag and timestamp, active flag, audit columns.

## 2. Security
- RLS enabled on all three tables.
- Table privileges are revoked from `anon` and `authenticated`, then re-granted only for the verbs in use. No DELETE is granted: records are deactivated, never removed.
- `products`: readable by admin, purchase, sales. Writable by admin only.
- `raw_materials`: readable by admin and purchase (costs are sensitive). Writable by admin only.
- `vendors`: readable, creatable and editable by admin and purchase.
- Store staff cannot read prices or costs from the tables. They use two read-only functions that return stock levels with no prices:
  - `list_product_stock()`
  - `list_raw_material_stock()`
  Both check the caller is an active staff member and are callable by authenticated users only.
- Price changes on products are written to `audit_log` automatically by a trigger.

## 3. Seed data
- 7 finished products (DHO-01 to DHGI-07) with opening stock and low-stock limits.
- 5 raw materials (MAT-01 to MAT-05).
- 3 vendors.
- Inserts use ON CONFLICT DO NOTHING, so re-running this migration never resets stock or edits records that already exist.

## 4. Important notes
1. Prices are per pack for retail and per kg for wholesale. Stock is always in kg.
2. Low-stock limits for raw materials are starting defaults chosen for the demo and can be changed later.
3. No existing tables were altered.
*/

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE CHECK (sku ~ '^[A-Z0-9-]+$'),
  name text NOT NULL,
  category text NOT NULL,
  description text,
  pack_size numeric(10,2) NOT NULL CHECK (pack_size > 0),
  pack_unit text NOT NULL DEFAULT 'g' CHECK (pack_unit IN ('g', 'kg')),
  retail_price numeric(10,2) NOT NULL CHECK (retail_price >= 0),
  wholesale_price numeric(10,2) NOT NULL CHECK (wholesale_price >= 0),
  stock_kg numeric(12,3) NOT NULL DEFAULT 0 CHECK (stock_kg >= 0),
  low_stock_limit_kg numeric(12,3) NOT NULL DEFAULT 0 CHECK (low_stock_limit_kg >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);

CREATE TABLE IF NOT EXISTS raw_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  unit text NOT NULL DEFAULT 'kg' CHECK (unit = 'kg'),
  cost_per_kg numeric(10,2) NOT NULL CHECK (cost_per_kg >= 0),
  stock_kg numeric(12,3) NOT NULL DEFAULT 0 CHECK (stock_kg >= 0),
  low_stock_limit_kg numeric(12,3) NOT NULL DEFAULT 0 CHECK (low_stock_limit_kg >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  vendor_type text NOT NULL CHECK (vendor_type IN ('farmer', 'shg', 'local_producer', 'trader')),
  contact_person text NOT NULL,
  phone text NOT NULL CHECK (phone ~ '^[0-9]{10}$'),
  village_cluster text NOT NULL,
  address text,
  upi_id text,
  supplies text[] NOT NULL DEFAULT '{}',
  is_id_verified boolean NOT NULL DEFAULT false,
  id_verified_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_vendors_type ON vendors (vendor_type);

DROP TRIGGER IF EXISTS products_set_updated_at ON products;
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS raw_materials_set_updated_at ON raw_materials;
CREATE TRIGGER raw_materials_set_updated_at BEFORE UPDATE ON raw_materials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS vendors_set_updated_at ON vendors;
CREATE TRIGGER vendors_set_updated_at BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION log_product_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.retail_price IS DISTINCT FROM OLD.retail_price
     OR NEW.wholesale_price IS DISTINCT FROM OLD.wholesale_price THEN
    INSERT INTO audit_log (action, entity, entity_id, old_values, new_values, created_by)
    VALUES (
      'price_changed',
      'product',
      NEW.id::text,
      jsonb_build_object('sku', OLD.sku, 'retail_price', OLD.retail_price, 'wholesale_price', OLD.wholesale_price),
      jsonb_build_object('sku', NEW.sku, 'retail_price', NEW.retail_price, 'wholesale_price', NEW.wholesale_price),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_product_price_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_log_price_change ON products;
CREATE TRIGGER products_log_price_change AFTER UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION log_product_price_change();

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON products, raw_materials, vendors FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON products TO authenticated;
GRANT SELECT, INSERT, UPDATE ON raw_materials TO authenticated;
GRANT SELECT, INSERT, UPDATE ON vendors TO authenticated;

DROP POLICY IF EXISTS "products_select_pricing_roles" ON products;
CREATE POLICY "products_select_pricing_roles" ON products FOR SELECT
  TO authenticated USING (current_app_role() IN ('admin', 'purchase', 'sales'));

DROP POLICY IF EXISTS "products_insert_admin" ON products;
CREATE POLICY "products_insert_admin" ON products FOR INSERT
  TO authenticated WITH CHECK (current_app_role() = 'admin');

DROP POLICY IF EXISTS "products_update_admin" ON products;
CREATE POLICY "products_update_admin" ON products FOR UPDATE
  TO authenticated USING (current_app_role() = 'admin') WITH CHECK (current_app_role() = 'admin');

DROP POLICY IF EXISTS "raw_materials_select_cost_roles" ON raw_materials;
CREATE POLICY "raw_materials_select_cost_roles" ON raw_materials FOR SELECT
  TO authenticated USING (current_app_role() IN ('admin', 'purchase'));

DROP POLICY IF EXISTS "raw_materials_insert_admin" ON raw_materials;
CREATE POLICY "raw_materials_insert_admin" ON raw_materials FOR INSERT
  TO authenticated WITH CHECK (current_app_role() = 'admin');

DROP POLICY IF EXISTS "raw_materials_update_admin" ON raw_materials;
CREATE POLICY "raw_materials_update_admin" ON raw_materials FOR UPDATE
  TO authenticated USING (current_app_role() = 'admin') WITH CHECK (current_app_role() = 'admin');

DROP POLICY IF EXISTS "vendors_select_purchase_roles" ON vendors;
CREATE POLICY "vendors_select_purchase_roles" ON vendors FOR SELECT
  TO authenticated USING (current_app_role() IN ('admin', 'purchase'));

DROP POLICY IF EXISTS "vendors_insert_purchase_roles" ON vendors;
CREATE POLICY "vendors_insert_purchase_roles" ON vendors FOR INSERT
  TO authenticated WITH CHECK (current_app_role() IN ('admin', 'purchase'));

DROP POLICY IF EXISTS "vendors_update_purchase_roles" ON vendors;
CREATE POLICY "vendors_update_purchase_roles" ON vendors FOR UPDATE
  TO authenticated USING (current_app_role() IN ('admin', 'purchase'))
  WITH CHECK (current_app_role() IN ('admin', 'purchase'));

CREATE OR REPLACE FUNCTION list_product_stock()
RETURNS TABLE (
  id uuid,
  sku text,
  name text,
  category text,
  pack_size numeric,
  pack_unit text,
  stock_kg numeric,
  low_stock_limit_kg numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.sku, p.name, p.category, p.pack_size, p.pack_unit, p.stock_kg, p.low_stock_limit_kg
  FROM products p
  WHERE current_app_role() IS NOT NULL AND p.is_active
  ORDER BY p.category, p.name
$$;

REVOKE EXECUTE ON FUNCTION list_product_stock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION list_product_stock() TO authenticated;

CREATE OR REPLACE FUNCTION list_raw_material_stock()
RETURNS TABLE (
  id uuid,
  code text,
  name text,
  unit text,
  stock_kg numeric,
  low_stock_limit_kg numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.code, r.name, r.unit, r.stock_kg, r.low_stock_limit_kg
  FROM raw_materials r
  WHERE current_app_role() IS NOT NULL AND r.is_active
  ORDER BY r.name
$$;

REVOKE EXECUTE ON FUNCTION list_raw_material_stock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION list_raw_material_stock() TO authenticated;

INSERT INTO products (sku, name, category, description, pack_size, pack_unit, retail_price, wholesale_price, stock_kg, low_stock_limit_kg)
VALUES
  ('DHO-01', 'Dehydrated Onion Flakes', 'Dehydrated Vegetables', 'Premium quality dehydrated white/red onion flakes, crisp and long shelf-life.', 250, 'g', 120, 400, 50, 10),
  ('DHT-02', 'Dehydrated Tomato Powder', 'Powders & Seasonings', 'Rich, 100% natural dehydrated tomato powder for instant gravies and seasoning.', 250, 'g', 150, 550, 30, 5),
  ('DHB-03', 'Wild Buransh (Rhododendron) Petals', 'Himalayan Forest Produce', 'Hand-harvested wild Buransh flower petals from Almora hills, rich in antioxidants.', 100, 'g', 200, 1600, 15, 3),
  ('DHP-04', 'Dehydrated Potato Chunks / Cubes', 'Dehydrated Vegetables', 'Uniformly cut, sun/machine-dried potato chunks ready for quick boiling and cooking.', 250, 'g', 90, 320, 75, 15),
  ('DHM-05', 'Dried Mountain Herbs & Mixed Leafy Greens', 'Mountain Herbs', 'Aromatic local herbs and seasonal green leaves sourced directly from high-altitude regions.', 100, 'g', 180, 1200, 20, 5),
  ('DHG-06', 'Dehydrated Garlic Cloves & Granules', 'Powders & Seasonings', 'Pungent, naturally dried garlic cloves and granules with intense flavour and long shelf-life.', 250, 'g', 160, 600, 25, 5),
  ('DHGI-07', 'Dehydrated Ginger Powder', 'Powders & Seasonings', 'Fine, sun-dried ginger powder with a strong aroma, ideal for chai, kadha and masala blends.', 250, 'g', 170, 650, 20, 5)
ON CONFLICT (sku) DO NOTHING;

INSERT INTO raw_materials (code, name, cost_per_kg, stock_kg, low_stock_limit_kg)
VALUES
  ('MAT-01', 'Raw Potato', 22, 200, 40),
  ('MAT-02', 'Raw Onion', 25, 150, 30),
  ('MAT-03', 'Raw Garlic', 90, 50, 10),
  ('MAT-04', 'Fresh Buransh Flowers', 150, 30, 5),
  ('MAT-05', 'Raw Ginger', 60, 40, 8)
ON CONFLICT (code) DO NOTHING;

INSERT INTO vendors (name, vendor_type, contact_person, phone, village_cluster, upi_id, supplies)
VALUES
  ('Mahila SHG Haldwani', 'shg', 'Sunita Devi', '9876543210', 'Haldwani, Nainital', NULL, ARRAY['Raw Onion', 'Raw Potato']),
  ('Himalayan Forest Producers Cluster', 'local_producer', 'Ramesh Rawat', '9123456789', 'Almora Cluster', NULL, ARRAY['Fresh Buransh Flowers', 'Dried Mountain Herbs']),
  ('Kumaon Agro Suppliers', 'trader', 'Mohan Joshi', '9811223344', 'Kathgodam, Nainital', NULL, ARRAY['Raw Garlic', 'Raw Ginger'])
ON CONFLICT (name) DO NOTHING;
