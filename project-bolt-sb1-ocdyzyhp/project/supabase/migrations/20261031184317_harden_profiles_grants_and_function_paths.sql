/*
# Harden table privileges and function search paths

## Plain-English summary
The first migration left the new tables with broad permissions that Supabase grants by default
(full read, write, and delete for every signed-in and anonymous request). Row level security blocks
most of that, but the profile update permission was too broad: it would allow a user to edit their own
role. This migration removes all default permissions and re-grants only what the app needs.

## 1. Modified privileges
- profiles: anon has no access. authenticated can SELECT, and can UPDATE only full_name and phone.
  Role and active status can only be changed by the admin functions.
- settings: anon can SELECT (RLS limits it to the demo flag). authenticated can SELECT, INSERT and UPDATE.
- audit_log: authenticated can SELECT only. Rows are written by the admin functions.
- No table allows DELETE. Financial and audit records are never hard-deleted.

## 2. Function safety
- set_updated_at now has a fixed search path to prevent search-path hijacking.

## 3. Notes
- Idempotent: safe to re-run.
- No data is changed.
*/

REVOKE ALL ON profiles FROM anon, authenticated;
REVOKE ALL ON settings FROM anon, authenticated;
REVOKE ALL ON audit_log FROM anon, authenticated;

GRANT SELECT ON profiles TO authenticated;
GRANT UPDATE (full_name, phone) ON profiles TO authenticated;

GRANT SELECT ON settings TO anon, authenticated;
GRANT INSERT, UPDATE ON settings TO authenticated;

GRANT SELECT ON audit_log TO authenticated;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
