-- Creative QC (SPI) Schema Migration
-- 
-- This migration adds support for Creative QC (Semantic Provenance Intelligence)
-- Enterprise-only beta feature
--
-- Run this migration in your Supabase SQL Editor

-- =====================================================
-- 1. Add Creative QC columns to qc_jobs table
-- =====================================================

-- Add Creative QC status column
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_status TEXT DEFAULT NULL
  CHECK (creative_qc_status IN ('pending', 'running', 'completed', 'failed', NULL));

-- Add Creative QC overall scores
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_overall_score INTEGER DEFAULT NULL;
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_overall_risk_score INTEGER DEFAULT NULL;
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_overall_brand_fit_score INTEGER DEFAULT NULL;

-- Add Creative QC parameters (JSONB for full parameter results)
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_parameters JSONB DEFAULT NULL;

-- Add Creative QC summary and recommendations
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_summary TEXT DEFAULT NULL;
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_recommendations JSONB DEFAULT NULL;

-- Add Creative QC error tracking
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_error TEXT DEFAULT NULL;

-- Add Creative QC processing timestamps
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_started_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_completed_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for Creative QC status queries
CREATE INDEX IF NOT EXISTS idx_qc_jobs_creative_qc_status ON qc_jobs(creative_qc_status);

-- =====================================================
-- 2. Add Creative QC settings to organizations table
-- =====================================================

-- Add Creative QC settings column to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS creative_qc_settings JSONB DEFAULT NULL;

-- Comment explaining the structure
COMMENT ON COLUMN organizations.creative_qc_settings IS 'Creative QC (SPI) settings: { enabled: boolean, betaAccepted: boolean, customParameters?: string[], targetAudience?: string, brandGuidelines?: string, platformType?: string }';

-- =====================================================
-- 3. Add feature flags table if not exists
-- =====================================================

CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, feature_key)
);

-- Add RLS policies for feature_flags
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Users can read their organization's feature flags
CREATE POLICY IF NOT EXISTS "Users can view own org feature flags" ON feature_flags
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Only admins can update feature flags (via service role)
CREATE POLICY IF NOT EXISTS "Service role can manage feature flags" ON feature_flags
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 4. Create Creative QC audit log table
-- =====================================================

CREATE TABLE IF NOT EXISTS creative_qc_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  job_id UUID REFERENCES qc_jobs(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'started', 'completed', 'failed', 'settings_updated'
  details JSONB DEFAULT '{}',
  performed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for audit log queries
CREATE INDEX IF NOT EXISTS idx_creative_qc_audit_org ON creative_qc_audit_log(organization_id, created_at DESC);

-- RLS for audit log
ALTER TABLE creative_qc_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view own org audit log" ON creative_qc_audit_log
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- =====================================================
-- 5. Helper functions
-- =====================================================

-- Function to check if Creative QC is enabled for an organization
CREATE OR REPLACE FUNCTION is_creative_qc_enabled(org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  settings JSONB;
BEGIN
  SELECT creative_qc_settings INTO settings
  FROM organizations
  WHERE id = org_id;
  
  IF settings IS NULL THEN
    RETURN FALSE;
  END IF;
  
  RETURN COALESCE((settings->>'enabled')::BOOLEAN, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get Creative QC statistics for an organization
CREATE OR REPLACE FUNCTION get_creative_qc_stats(org_id UUID)
RETURNS TABLE (
  total_analyzed BIGINT,
  avg_creative_score NUMERIC,
  avg_risk_score NUMERIC,
  avg_brand_fit_score NUMERIC,
  high_risk_count BIGINT,
  low_score_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_analyzed,
    ROUND(AVG(creative_qc_overall_score)::NUMERIC, 1) as avg_creative_score,
    ROUND(AVG(creative_qc_overall_risk_score)::NUMERIC, 1) as avg_risk_score,
    ROUND(AVG(creative_qc_overall_brand_fit_score)::NUMERIC, 1) as avg_brand_fit_score,
    COUNT(*) FILTER (WHERE creative_qc_overall_risk_score > 70)::BIGINT as high_risk_count,
    COUNT(*) FILTER (WHERE creative_qc_overall_score < 50)::BIGINT as low_score_count
  FROM qc_jobs
  WHERE organisation_id = org_id
    AND creative_qc_status = 'completed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. Grant permissions
-- =====================================================

-- Grant access to authenticated users
GRANT SELECT ON feature_flags TO authenticated;
GRANT SELECT ON creative_qc_audit_log TO authenticated;
GRANT EXECUTE ON FUNCTION is_creative_qc_enabled TO authenticated;
GRANT EXECUTE ON FUNCTION get_creative_qc_stats TO authenticated;

-- Done!
SELECT 'Creative QC schema migration completed successfully!' AS status;

