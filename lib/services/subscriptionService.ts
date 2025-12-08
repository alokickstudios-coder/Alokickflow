/**
 * Subscription Service
 * 
 * Handles subscription checks, feature gating, and usage tracking.
 * All logic is config-driven via subscriptionConfig.ts
 */

import { createClient } from '@supabase/supabase-js';
import {
  PlanSlug,
  AddonSlug,
  FeatureKey,
  QCLevel,
  PLANS,
  ADDONS,
  getPlanConfig,
  getAddonConfig,
  canPlanUseAddon,
} from '@/config/subscriptionConfig';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface OrganisationSubscription {
  id: string;
  organisation_id: string;
  plan_id: string;
  plan_slug: PlanSlug;
  plan: {
    slug: PlanSlug;
    name: string;
    description: string;
    qcLevel: QCLevel;
  };
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'inactive';
  current_period_start: string;
  current_period_end: string;
  billing_cycle: 'monthly' | 'yearly';
  enabled_addons: AddonSlug[];
}

export interface UsageData {
  series_count: number;
  episode_count: number;
  qc_minutes: number;
  period_start: string;
  period_end: string;
}

export interface CanProcessSeriesResult {
  allowed: boolean;
  requiresOverage: boolean;
  remainingSeries: number | null;
  limit: number | null;
}

/**
 * Get organisation's active subscription with plan and enabled addons
 */
export async function getOrganisationSubscription(
  orgId: string
): Promise<OrganisationSubscription | null> {
  const supabase = getAdminClient();
  if (!supabase) {
    throw new Error('Server configuration error');
  }

  const nowIso = new Date().toISOString();

  // Get active subscription
  const { data: subscription, error: subError } = await supabase
    .from('organisation_subscriptions')
    .select('*, plan:plans(*)')
    .eq('organisation_id', orgId)
    .eq('status', 'active')
    .single();

  if (subError || !subscription) {
    // Fallback 1: use organization's subscription_tier if set
    const { data: org } = await supabase
      .from('organizations')
      .select('subscription_tier')
      .eq('id', orgId)
      .single();

    const orgTier = org?.subscription_tier as PlanSlug | undefined;

    // Fallback 2: default plan (is_default)
    const { data: defaultPlan } = await supabase
      .from('plans')
      .select('*')
      .eq('is_default', true)
      .single();

    const planToUse = orgTier ? orgTier : (defaultPlan?.slug as PlanSlug | undefined) || 'free';

    // Ensure we have the plan record
    const { data: planRecord } = await supabase
      .from('plans')
      .select('*')
      .eq('slug', planToUse)
      .single();

    if (!planRecord) {
      return null;
    }

    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    // Upsert subscription for this org so downstream calls stay consistent
    const { data: upsertedSub, error: upsertError } = await supabase
      .from('organisation_subscriptions')
      .upsert(
        {
          organisation_id: orgId,
          plan_id: planRecord.id,
          status: 'active',
          current_period_start: nowIso,
          current_period_end: periodEnd.toISOString(),
          billing_cycle: 'monthly',
        },
        { onConflict: 'organisation_id' }
      )
      .select('*, plan:plans(*)')
      .single();

    if (upsertError || !upsertedSub) {
      return null;
    }

    // Auto-enable default addons for enterprise
    if (planToUse === 'enterprise') {
      const allAddonSlugs = Object.keys(ADDONS) as AddonSlug[];
      const addonRows = allAddonSlugs.map((slug) => ({
        organisation_id: orgId,
        addon_id: null, // will update below
        status: 'active',
        current_period_start: nowIso,
        current_period_end: periodEnd.toISOString(),
        billing_cycle: 'monthly',
      }));

      // Resolve addon ids and upsert
      const { data: addonRecords } = await supabase.from('addons').select('id, slug');
      if (addonRecords) {
        const rows = addonRecords.map((a) => ({
          organisation_id: orgId,
          addon_id: a.id,
          status: 'active',
          current_period_start: nowIso,
          current_period_end: periodEnd.toISOString(),
          billing_cycle: 'monthly',
        }));
        if (rows.length > 0) {
          await supabase
            .from('organisation_addons')
            .upsert(rows, { onConflict: 'organisation_id,addon_id' });
        }
      }
    }

    return {
      id: upsertedSub.id,
      organisation_id: upsertedSub.organisation_id,
      plan_id: upsertedSub.plan_id,
      plan_slug: upsertedSub.plan.slug as PlanSlug,
      plan: {
        slug: upsertedSub.plan.slug as PlanSlug,
        name: upsertedSub.plan.name,
        description: upsertedSub.plan.description || '',
        qcLevel: getPlanConfig(upsertedSub.plan.slug as PlanSlug).qcLevel,
      },
      status: upsertedSub.status,
      current_period_start: upsertedSub.current_period_start,
      current_period_end: upsertedSub.current_period_end,
      billing_cycle: upsertedSub.billing_cycle,
      enabled_addons: planToUse === 'enterprise' ? (Object.keys(ADDONS) as AddonSlug[]) : [],
    };
  }

  const planSlug = subscription.plan?.slug as PlanSlug;

  // Get enabled addons
  const { data: addons } = await supabase
    .from('organisation_addons')
    .select('*, addon:addons(*)')
    .eq('organisation_id', orgId)
    .eq('status', 'active')
    .gte('current_period_end', nowIso);

  const enabledAddons: AddonSlug[] = (addons || [])
    .map((a: any) => a.addon?.slug)
    .filter(Boolean) as AddonSlug[];

  // Include default addons from plan config
  const planConfig = getPlanConfig(planSlug);
  const allEnabledAddons = [
    ...new Set([...planConfig.defaultAddons, ...enabledAddons]),
  ] as AddonSlug[];

  return {
    id: subscription.id,
    organisation_id: subscription.organisation_id,
    plan_id: subscription.plan_id,
    plan_slug: planSlug,
    plan: {
      slug: planSlug,
      name: subscription.plan?.name || '',
      description: subscription.plan?.description || '',
      qcLevel: getPlanConfig(planSlug).qcLevel,
    },
    status: subscription.status,
    current_period_start: subscription.current_period_start,
    current_period_end: subscription.current_period_end,
    billing_cycle: subscription.billing_cycle,
    enabled_addons: allEnabledAddons,
  };
}

/**
 * Get current usage for an organisation in the current billing period
 */
export async function getCurrentUsage(
  orgId: string,
  date: Date = new Date()
): Promise<UsageData> {
  const supabase = getAdminClient();
  if (!supabase) {
    throw new Error('Server configuration error');
  }

  // Get subscription to determine billing period
  const subscription = await getOrganisationSubscription(orgId);
  if (!subscription) {
    throw new Error('No subscription found');
  }

  const periodStart = new Date(subscription.current_period_start);
  const periodEnd = new Date(subscription.current_period_end);

  // Find or create usage record
  const { data: usage, error } = await supabase
    .from('qc_usage_monthly')
    .select('*')
    .eq('organisation_id', orgId)
    .eq('period_start', periodStart.toISOString().split('T')[0])
    .single();

  if (error && error.code === 'PGRST116') {
    // Create new usage record
    const { data: newUsage, error: createError } = await supabase
      .from('qc_usage_monthly')
      .insert({
        organisation_id: orgId,
        period_start: periodStart.toISOString().split('T')[0],
        period_end: periodEnd.toISOString().split('T')[0],
        series_count: 0,
        episode_count: 0,
        qc_minutes: 0,
      })
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    return {
      series_count: newUsage.series_count || 0,
      episode_count: newUsage.episode_count || 0,
      qc_minutes: newUsage.qc_minutes || 0,
      period_start: newUsage.period_start,
      period_end: newUsage.period_end,
    };
  }

  if (error) {
    throw error;
  }

  return {
    series_count: usage?.series_count || 0,
    episode_count: usage?.episode_count || 0,
    qc_minutes: usage?.qc_minutes || 0,
    period_start: usage?.period_start || periodStart.toISOString().split('T')[0],
    period_end: usage?.period_end || periodEnd.toISOString().split('T')[0],
  };
}

/**
 * Increment usage when a new series is processed
 */
export async function incrementUsageForSeries(
  orgId: string,
  seriesId: string,
  episodeCount: number = 1,
  qcMinutes: number = 0
): Promise<void> {
  const supabase = getAdminClient();
  if (!supabase) {
    throw new Error('Server configuration error');
  }

  const usage = await getCurrentUsage(orgId);

  // Check if this series was already counted
  // For simplicity, we'll increment series_count on first QC job
  // In production, you might want to track which series were already counted

  const { error } = await supabase
    .from('qc_usage_monthly')
    .update({
      series_count: usage.series_count + 1,
      episode_count: usage.episode_count + episodeCount,
      qc_minutes: usage.qc_minutes + qcMinutes,
      updated_at: new Date().toISOString(),
    })
    .eq('organisation_id', orgId)
    .eq('period_start', usage.period_start);

  if (error) {
    throw error;
  }
}

/**
 * Check if organisation has access to a specific feature
 */
export async function hasFeature(
  orgId: string,
  feature: FeatureKey
): Promise<boolean> {
  const subscription = await getOrganisationSubscription(orgId);
  if (!subscription) {
    return false;
  }

  const planConfig = getPlanConfig(subscription.plan_slug);

  // Check QC level features
  if (feature === 'basic_qc') {
    return planConfig.qcLevel === 'basic' || planConfig.qcLevel === 'full';
  }

  if (feature === 'full_qc') {
    return planConfig.qcLevel === 'full';
  }

  // Check addon features
  const addonFeatures: FeatureKey[] = [
    'lip_sync_qc',
    'video_glitch_qc',
    'bgm_detection',
    'premium_qc_report',
    'multi_language_qc',
    'creative_qc_spi',
  ];

  if (addonFeatures.includes(feature)) {
    // First check if addon is enabled in subscription
    if (subscription.enabled_addons.includes(feature as AddonSlug)) {
      return true;
    }
    
    // Also check feature_flags table for feature flags
    const supabase = getAdminClient();
    if (supabase) {
      const { data: flag } = await supabase
        .from('feature_flags')
        .select('enabled')
        .eq('organization_id', orgId)
        .eq('feature_key', feature)
        .single();
      
      if (flag?.enabled) {
        return true;
      }
    }
    
    return false;
  }

  return false;
}

/**
 * Get organization subscription - exported for external use
 */
export { getOrganisationSubscription as getOrganizationSubscription };

/**
 * Check if organisation can process a new series
 */
export async function canProcessNewSeries(
  orgId: string
): Promise<CanProcessSeriesResult> {
  const subscription = await getOrganisationSubscription(orgId);
  if (!subscription) {
    return {
      allowed: false,
      requiresOverage: false,
      remainingSeries: null,
      limit: null,
    };
  }

  const planConfig = getPlanConfig(subscription.plan_slug);
  const usage = await getCurrentUsage(orgId);

  // If limit is null, unlimited
  if (planConfig.includedSeriesPerBillingCycle === null) {
    return {
      allowed: true,
      requiresOverage: false,
      remainingSeries: null,
      limit: null,
    };
  }

  const limit = planConfig.includedSeriesPerBillingCycle;
  const remaining = Math.max(0, limit - usage.series_count);

  if (usage.series_count >= limit) {
    return {
      allowed: false,
      requiresOverage: true,
      remainingSeries: 0,
      limit,
    };
  }

  return {
    allowed: true,
    requiresOverage: false,
    remainingSeries: remaining,
    limit,
  };
}

