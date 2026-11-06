/*
# Profiles, roles, settings and audit log

## Plain-English summary
Creates the foundation for staff accounts. Every signed-in person has a profile that stores their name,
phone, one of four roles, and whether the account is active. Admins manage roles and activation through
secure database functions, so the browser can never change its own role.

## 1. New tables
- `profiles`: one row per staff member. `id` equals the sign-in user id. Columns: full_name, phone (10 digits),
  role (admin | purchase | store | sales), is_active, created_at, updated_at, created_by.
- `settings`: key/value store for app-wide options (for example `show_demo_login`). Columns: key, value (jsonb),
  created_at, updated_at, created_by.
- `audit_log`: append-only history of important changes (who, what, when, old and new values, reason).

## 2. Helper function
- `current_app_role()` returns the role of the currently signed-in, active user. Used by RLS policies.

## 3. Admin functions
- `admin_set_user_role(user, role)` and `admin_set_user_active(user, active)`. Admin only. Cannot
  demote or deactivate yourself. Every change is written to `audit_log`.

## 4. Security
- RLS enabled on all three tables.
- Profiles: users read their own row; admins read all rows. Users may edit only full_name and phone
  (column-level grant). Role and active status are never writable directly.
- Settings: anonymous visitors may read only the `show_demo_login` flag; staff read all settings;
  only admins insert or update.
- Audit log: admins only read it. No direct insert grant; rows are written by the functions above.
- Functions are not callable by anonymous visitors.

## 5. Notes
- Migration is idempotent and safe to re-run.
- No data is removed or altered in existing tables (none existed before this migration).
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text CHECK (phone IS NULL OR phone ~ '^[0-9]{10}$'),
  role text NOT NULL CHECK (role IN ('admin', 'purchase', 'store', 'sales')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles (role);

CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity, entity_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_settings_updated_at ON settings;
CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active
$$;

REVOKE EXECUTE ON FUNCTION current_app_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION current_app_role() TO authenticated;

CREATE OR REPLACE FUNCTION admin_set_user_role(p_user uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text;
BEGIN
  IF current_app_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an admin can change roles' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('admin', 'purchase', 'store', 'sales') THEN
    RAISE EXCEPTION 'Unknown role' USING ERRCODE = '22023';
  END IF;
  IF p_user = auth.uid() AND p_role <> 'admin' THEN
    RAISE EXCEPTION 'You cannot remove your own admin role' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_old FROM profiles WHERE id = p_user;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE profiles SET role = p_role WHERE id = p_user;

  INSERT INTO audit_log (action, entity, entity_id, old_values, new_values, created_by)
  VALUES ('role_changed', 'profile', p_user::text,
          jsonb_build_object('role', v_old), jsonb_build_object('role', p_role), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_user_active(p_user uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old boolean;
BEGIN
  IF current_app_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an admin can change account status' USING ERRCODE = '42501';
  END IF;
  IF p_user = auth.uid() AND NOT p_active THEN
    RAISE EXCEPTION 'You cannot deactivate your own account' USING ERRCODE = '42501';
  END IF;

  SELECT is_active INTO v_old FROM profiles WHERE id = p_user;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE profiles SET is_active = p_active WHERE id = p_user;

  INSERT INTO audit_log (action, entity, entity_id, old_values, new_values, created_by)
  VALUES (CASE WHEN p_active THEN 'account_activated' ELSE 'account_deactivated' END,
          'profile', p_user::text,
          jsonb_build_object('is_active', v_old), jsonb_build_object('is_active', p_active), auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_set_user_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_user_role(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION admin_set_user_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_user_active(uuid, boolean) TO authenticated;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON profiles TO authenticated;
GRANT UPDATE (full_name, phone) ON profiles TO authenticated;

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON profiles;
CREATE POLICY "profiles_select_own_or_admin" ON profiles FOR SELECT
  TO authenticated USING (id = auth.uid() OR current_app_role() = 'admin');

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

GRANT SELECT ON settings TO anon, authenticated;
GRANT INSERT, UPDATE ON settings TO authenticated;

DROP POLICY IF EXISTS "settings_read_demo_flag_anon" ON settings;
CREATE POLICY "settings_read_demo_flag_anon" ON settings FOR SELECT
  TO anon USING (key = 'show_demo_login');

DROP POLICY IF EXISTS "settings_read_staff" ON settings;
CREATE POLICY "settings_read_staff" ON settings FOR SELECT
  TO authenticated USING (current_app_role() IS NOT NULL);

DROP POLICY IF EXISTS "settings_insert_admin" ON settings;
CREATE POLICY "settings_insert_admin" ON settings FOR INSERT
  TO authenticated WITH CHECK (current_app_role() = 'admin');

DROP POLICY IF EXISTS "settings_update_admin" ON settings;
CREATE POLICY "settings_update_admin" ON settings FOR UPDATE
  TO authenticated USING (current_app_role() = 'admin') WITH CHECK (current_app_role() = 'admin');

GRANT SELECT ON audit_log TO authenticated;

DROP POLICY IF EXISTS "audit_log_select_admin" ON audit_log;
CREATE POLICY "audit_log_select_admin" ON audit_log FOR SELECT
  TO authenticated USING (current_app_role() = 'admin');
