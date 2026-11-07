ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_path text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_image_path_check'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_image_path_check
      CHECK (
        image_path IS NULL OR
        image_path ~ '^products/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$'
      );
  END IF;
END;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "product_images_admin_insert" ON storage.objects;
CREATE POLICY "product_images_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.current_app_role() = 'admin');

DROP POLICY IF EXISTS "product_images_admin_update" ON storage.objects;
CREATE POLICY "product_images_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.current_app_role() = 'admin')
  WITH CHECK (bucket_id = 'product-images' AND public.current_app_role() = 'admin');

DROP POLICY IF EXISTS "product_images_admin_delete" ON storage.objects;
CREATE POLICY "product_images_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.current_app_role() = 'admin');

DROP POLICY IF EXISTS "product_images_admin_select" ON storage.objects;
CREATE POLICY "product_images_admin_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'product-images' AND public.current_app_role() = 'admin');

CREATE OR REPLACE FUNCTION audit_catalog_master_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity text;
  v_action text;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'products' THEN v_entity := 'product';
    WHEN 'raw_materials' THEN v_entity := 'raw_material';
    WHEN 'vendors' THEN v_entity := 'vendor';
    ELSE RAISE EXCEPTION 'Unsupported catalog table: %', TG_TABLE_NAME;
  END CASE;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (action, entity, entity_id, old_values, new_values, created_by)
    VALUES (
      v_entity || '_created',
      v_entity,
      NEW.id::text,
      NULL,
      to_jsonb(NEW) - 'created_at' - 'updated_at' - 'created_by',
      auth.uid()
    );
    RETURN NEW;
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    v_action := v_entity || CASE WHEN NEW.is_active THEN '_reactivated' ELSE '_deactivated' END;
    INSERT INTO audit_log (action, entity, entity_id, old_values, new_values, created_by)
    VALUES (
      v_action,
      v_entity,
      NEW.id::text,
      jsonb_build_object('is_active', OLD.is_active),
      jsonb_build_object('is_active', NEW.is_active),
      auth.uid()
    );
  END IF;

  IF TG_TABLE_NAME = 'products' THEN
    IF NEW.stock_kg IS DISTINCT FROM OLD.stock_kg AND current_setting('app.stock_rpc', true) IS DISTINCT FROM 'on' THEN
      INSERT INTO audit_log (action, entity, entity_id, old_values, new_values, created_by)
      VALUES (
        'product_stock_changed',
        v_entity,
        NEW.id::text,
        jsonb_build_object('sku', OLD.sku, 'stock_kg', OLD.stock_kg),
        jsonb_build_object('sku', NEW.sku, 'stock_kg', NEW.stock_kg),
        auth.uid()
      );
    END IF;

    IF ROW(NEW.name, NEW.category, NEW.description, NEW.pack_size, NEW.pack_unit, NEW.low_stock_limit_kg)
       IS DISTINCT FROM
       ROW(OLD.name, OLD.category, OLD.description, OLD.pack_size, OLD.pack_unit, OLD.low_stock_limit_kg) THEN
      INSERT INTO audit_log (action, entity, entity_id, old_values, new_values, created_by)
      VALUES (
        'product_updated',
        v_entity,
        NEW.id::text,
        jsonb_build_object(
          'name', OLD.name, 'category', OLD.category, 'description', OLD.description,
          'pack_size', OLD.pack_size, 'pack_unit', OLD.pack_unit, 'low_stock_limit_kg', OLD.low_stock_limit_kg
        ),
        jsonb_build_object(
          'name', NEW.name, 'category', NEW.category, 'description', NEW.description,
          'pack_size', NEW.pack_size, 'pack_unit', NEW.pack_unit, 'low_stock_limit_kg', NEW.low_stock_limit_kg
        ),
        auth.uid()
      );
    END IF;

    IF NEW.image_path IS DISTINCT FROM OLD.image_path THEN
      INSERT INTO audit_log (action, entity, entity_id, old_values, new_values, created_by)
      VALUES (
        'product_image_changed',
        v_entity,
        NEW.id::text,
        jsonb_build_object('image_path', OLD.image_path),
        jsonb_build_object('image_path', NEW.image_path),
        auth.uid()
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'raw_materials' THEN
    IF NEW.stock_kg IS DISTINCT FROM OLD.stock_kg AND current_setting('app.stock_rpc', true) IS DISTINCT FROM 'on' THEN
      INSERT INTO audit_log (action, entity, entity_id, old_values, new_values, created_by)
      VALUES (
        'raw_material_stock_changed',
        v_entity,
        NEW.id::text,
        jsonb_build_object('code', OLD.code, 'stock_kg', OLD.stock_kg),
        jsonb_build_object('code', NEW.code, 'stock_kg', NEW.stock_kg),
        auth.uid()
      );
    END IF;

    IF NEW.cost_per_kg IS DISTINCT FROM OLD.cost_per_kg THEN
      INSERT INTO audit_log (action, entity, entity_id, old_values, new_values, created_by)
      VALUES (
        'raw_material_cost_changed',
        v_entity,
        NEW.id::text,
        jsonb_build_object('code', OLD.code, 'cost_per_kg', OLD.cost_per_kg),
        jsonb_build_object('code', NEW.code, 'cost_per_kg', NEW.cost_per_kg),
        auth.uid()
      );
    END IF;

    IF ROW(NEW.code, NEW.name, NEW.low_stock_limit_kg)
       IS DISTINCT FROM
       ROW(OLD.code, OLD.name, OLD.low_stock_limit_kg) THEN
      INSERT INTO audit_log (action, entity, entity_id, old_values, new_values, created_by)
      VALUES (
        'raw_material_updated',
        v_entity,
        NEW.id::text,
        jsonb_build_object('code', OLD.code, 'name', OLD.name, 'low_stock_limit_kg', OLD.low_stock_limit_kg),
        jsonb_build_object('code', NEW.code, 'name', NEW.name, 'low_stock_limit_kg', NEW.low_stock_limit_kg),
        auth.uid()
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'vendors'
    AND ROW(
      NEW.name, NEW.vendor_type, NEW.contact_person, NEW.phone, NEW.village_cluster,
      NEW.address, NEW.upi_id, NEW.supplies, NEW.is_id_verified, NEW.id_verified_at
    ) IS DISTINCT FROM ROW(
      OLD.name, OLD.vendor_type, OLD.contact_person, OLD.phone, OLD.village_cluster,
      OLD.address, OLD.upi_id, OLD.supplies, OLD.is_id_verified, OLD.id_verified_at
    ) THEN
    INSERT INTO audit_log (action, entity, entity_id, old_values, new_values, created_by)
    VALUES (
      'vendor_updated',
      v_entity,
      NEW.id::text,
      jsonb_build_object(
        'name', OLD.name, 'vendor_type', OLD.vendor_type, 'contact_person', OLD.contact_person,
        'phone', OLD.phone, 'village_cluster', OLD.village_cluster, 'address', OLD.address,
        'upi_id', OLD.upi_id, 'supplies', OLD.supplies, 'is_id_verified', OLD.is_id_verified
      ),
      jsonb_build_object(
        'name', NEW.name, 'vendor_type', NEW.vendor_type, 'contact_person', NEW.contact_person,
        'phone', NEW.phone, 'village_cluster', NEW.village_cluster, 'address', NEW.address,
        'upi_id', NEW.upi_id, 'supplies', NEW.supplies, 'is_id_verified', NEW.is_id_verified
      ),
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION audit_catalog_master_data() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS list_product_stock();
CREATE OR REPLACE FUNCTION list_product_stock()
RETURNS TABLE (
  id uuid,
  sku text,
  name text,
  category text,
  pack_size numeric,
  pack_unit text,
  stock_kg numeric,
  low_stock_limit_kg numeric,
  image_path text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.sku, p.name, p.category, p.pack_size, p.pack_unit, p.stock_kg, p.low_stock_limit_kg, p.image_path
  FROM products p
  WHERE current_app_role() IS NOT NULL AND p.is_active
  ORDER BY p.category, p.name
$$;

REVOKE EXECUTE ON FUNCTION list_product_stock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION list_product_stock() TO authenticated;