DROP POLICY IF EXISTS "settings_read_demo_flag_anon" ON settings;
REVOKE ALL ON settings FROM anon;
DELETE FROM settings WHERE key = 'show_demo_login';
