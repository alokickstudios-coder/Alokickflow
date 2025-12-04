-- =====================================================
-- GOOGLE OAUTH SETTINGS TABLE
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql/new
-- =====================================================

-- App-wide settings table (single row expected)
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_client_id TEXT,
  google_client_secret TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Ensure at least one row exists (global settings)
INSERT INTO app_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "Service role full access app_settings" ON app_settings;
CREATE POLICY "Service role full access app_settings" ON app_settings
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Admins can view settings (optional, for future UI with anon key)
DROP POLICY IF EXISTS "Admins can view app_settings" ON app_settings;
CREATE POLICY "Admins can view app_settings" ON app_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Helper: see current Google OAuth config
SELECT google_client_id,
       CASE WHEN google_client_secret IS NULL THEN false ELSE true END AS has_secret,
       updated_at
FROM app_settings
LIMIT 1;



