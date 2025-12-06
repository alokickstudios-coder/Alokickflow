-- =====================================================
-- Subscription & Feature Gating Schema
-- AlokickFlow - Subscription System
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. PLANS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE CHECK (slug IN ('free', 'mid', 'enterprise')),
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. ADDONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS addons (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. ORGANISATION_SUBSCRIPTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS organisation_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled', 'inactive')),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    external_customer_id TEXT,
    external_subscription_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organisation_id) -- One active subscription per org
);

-- =====================================================
-- 4. ORGANISATION_ADDONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS organisation_addons (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    addon_id UUID NOT NULL REFERENCES addons(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled', 'inactive')),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organisation_id, addon_id) -- One addon subscription per org per addon
);

-- =====================================================
-- 5. QC_USAGE_MONTHLY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS qc_usage_monthly (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    series_count INTEGER DEFAULT 0,
    episode_count INTEGER DEFAULT 0,
    qc_minutes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organisation_id, period_start) -- One record per org per period
);

-- =====================================================
-- 6. QC_JOBS TABLE (if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS qc_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    episode_id UUID, -- Can reference episodes if that table exists
    delivery_id UUID REFERENCES deliveries(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    qc_type TEXT NOT NULL CHECK (qc_type IN ('basic', 'full', 'lip_sync', 'video_glitch', 'bgm_detection', 'premium_report', 'multi_language')),
    result JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_org_id ON organisation_subscriptions(organisation_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status ON organisation_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_org_addons_org_id ON organisation_addons(organisation_id);
CREATE INDEX IF NOT EXISTS idx_org_addons_status ON organisation_addons(status);
CREATE INDEX IF NOT EXISTS idx_qc_usage_org_period ON qc_usage_monthly(organisation_id, period_start);
CREATE INDEX IF NOT EXISTS idx_qc_jobs_org_id ON qc_jobs(organisation_id);
CREATE INDEX IF NOT EXISTS idx_qc_jobs_project_id ON qc_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_qc_jobs_status ON qc_jobs(status);

-- =====================================================
-- INITIAL DATA: Insert default plans
-- =====================================================
INSERT INTO plans (slug, name, description, is_default, metadata) VALUES
    ('free', 'Free', 'Basic plan with limited features', TRUE, '{"maxVendors": 5, "maxTeamMembers": 3, "includedSeriesPerBillingCycle": 10, "qcLevel": "none"}'::jsonb),
    ('mid', 'Mid', 'Mid-tier plan with enhanced features', FALSE, '{"maxVendors": 20, "maxTeamMembers": 10, "includedSeriesPerBillingCycle": 50, "qcLevel": "basic"}'::jsonb),
    ('enterprise', 'Enterprise', 'Full-featured enterprise plan', FALSE, '{"maxVendors": null, "maxTeamMembers": null, "includedSeriesPerBillingCycle": null, "qcLevel": "full"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- INITIAL DATA: Insert default addons
-- =====================================================
INSERT INTO addons (slug, name, description, metadata) VALUES
    ('lip_sync_qc', 'Lip Sync QC', 'Advanced lip-sync detection using AI', '{"type": "qc_feature"}'::jsonb),
    ('video_glitch_qc', 'Video Glitch Detection', 'Detect video glitches and frame drops', '{"type": "qc_feature"}'::jsonb),
    ('bgm_detection', 'BGM Detection', 'Background music detection and analysis', '{"type": "qc_feature"}'::jsonb),
    ('premium_qc_report', 'Premium QC Report', 'Enhanced QC reports with AI insights', '{"type": "qc_feature"}'::jsonb),
    ('multi_language_qc', 'Multi-Language QC', 'QC support for multiple languages', '{"type": "qc_feature"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- RLS POLICIES (if RLS is enabled)
-- =====================================================
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_jobs ENABLE ROW LEVEL SECURITY;

-- Policies: Users can view plans and addons (public)
CREATE POLICY "Plans are viewable by authenticated users" ON plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Addons are viewable by authenticated users" ON addons FOR SELECT TO authenticated USING (true);

-- Policies: Users can view their organization's subscription
CREATE POLICY "Users can view own org subscription" ON organisation_subscriptions FOR SELECT TO authenticated
    USING (organisation_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Policies: Users can view their organization's addons
CREATE POLICY "Users can view own org addons" ON organisation_addons FOR SELECT TO authenticated
    USING (organisation_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Policies: Users can view their organization's usage
CREATE POLICY "Users can view own org usage" ON qc_usage_monthly FOR SELECT TO authenticated
    USING (organisation_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Policies: Users can view their organization's QC jobs
CREATE POLICY "Users can view own org qc jobs" ON qc_jobs FOR SELECT TO authenticated
    USING (organisation_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Note: Updates/Inserts should be done via service role or with proper admin checks

