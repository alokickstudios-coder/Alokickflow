/**
 * Subscription Configuration
 * 
 * Central configuration for plans, limits, pricing, and add-ons.
 * All pricing and limits are defined here - change values here to update across the app.
 * 
 * NOTE: Pricing values are placeholders. Update with real INR values when ready.
 */

export type PlanSlug = 'free' | 'mid' | 'enterprise';
export type AddonSlug = 
  | 'lip_sync_qc' 
  | 'video_glitch_qc' 
  | 'bgm_detection' 
  | 'premium_qc_report' 
  | 'multi_language_qc'
  | 'creative_qc_spi';

export type QCLevel = 'none' | 'basic' | 'full';
export type FeatureKey = 
  | 'basic_qc' 
  | 'full_qc' 
  | 'lip_sync_qc' 
  | 'video_glitch_qc' 
  | 'bgm_detection' 
  | 'premium_qc_report' 
  | 'multi_language_qc'
  | 'creative_qc_spi';

export type BillingCycle = 'monthly' | 'yearly';

export interface PlanPricing {
  monthly: number; // Placeholder INR value
  yearly: number; // Placeholder INR value
}

export interface PlanConfig {
  slug: PlanSlug;
  name: string;
  description: string;
  maxVendors: number | null; // null = unlimited
  maxTeamMembers: number | null; // null = unlimited
  includedSeriesPerBillingCycle: number | null; // null = unlimited
  qcLevel: QCLevel;
  perSeriesOverageFee?: number; // Charge per series after limit (for mid plan)
  defaultAddons: AddonSlug[]; // Addons enabled by default for this plan
  pricing: PlanPricing;
  enterpriseCustomisation?: boolean;
}

export interface AddonConfig {
  slug: AddonSlug;
  name: string;
  description: string;
  type: 'qc_feature';
  dependsOnPlan?: PlanSlug[]; // Plans that can use this addon (empty = all plans)
  pricing: PlanPricing;
}

/**
 * PLANS Configuration
 * 
 * Define limits and features for each plan tier.
 * Update pricing values when ready to go live.
 */
export const PLANS: Record<PlanSlug, PlanConfig> = {
  free: {
    slug: 'free',
    name: 'Free',
    description: 'Workflow only, no automated QC',
    maxVendors: 20,
    maxTeamMembers: 100,
    includedSeriesPerBillingCycle: 0,
    qcLevel: 'none',
    defaultAddons: [],
    pricing: {
      monthly: 0,
      yearly: 0,
    },
  },
  mid: {
    slug: 'mid',
    name: 'Mid',
    description: 'Basic QC with overage after 50 series',
    maxVendors: 100,
    maxTeamMembers: 1000,
    includedSeriesPerBillingCycle: 50,
    qcLevel: 'basic',
    perSeriesOverageFee: 25,
    defaultAddons: [],
    pricing: {
      monthly: 2500,
      yearly: 25000,
    },
  },
  enterprise: {
    slug: 'enterprise',
    name: 'Enterprise',
    description: 'Full QC, all add-ons, unlimited usage, Creative QC (SPI)',
    maxVendors: null, // Unlimited
    maxTeamMembers: null, // Unlimited
    includedSeriesPerBillingCycle: null, // Unlimited
    qcLevel: 'full',
    defaultAddons: [
      'lip_sync_qc',
      'video_glitch_qc',
      'bgm_detection',
      'premium_qc_report',
      'multi_language_qc',
      'creative_qc_spi',
    ],
    enterpriseCustomisation: true,
    pricing: {
      monthly: 100000,
      yearly: 1000000,
    },
  },
};

/**
 * ADDONS Configuration
 * 
 * Define premium features that can be added to any plan.
 * Update pricing values when ready to go live.
 */
export const ADDONS: Record<AddonSlug, AddonConfig> = {
  lip_sync_qc: {
    slug: 'lip_sync_qc',
    name: 'Lip-sync QC',
    description: 'Advanced lip-sync detection',
    type: 'qc_feature',
    dependsOnPlan: ['mid', 'enterprise'],
    pricing: {
      monthly: 999,
      yearly: 9999,
    },
  },
  video_glitch_qc: {
    slug: 'video_glitch_qc',
    name: 'Video Glitch QC',
    description: 'Detects glitches and frame drops',
    type: 'qc_feature',
    dependsOnPlan: ['mid', 'enterprise'],
    pricing: {
      monthly: 499,
      yearly: 4999,
    },
  },
  bgm_detection: {
    slug: 'bgm_detection',
    name: 'BGM Detection',
    description: 'Background music detection',
    type: 'qc_feature',
    dependsOnPlan: ['mid', 'enterprise'],
    pricing: {
      monthly: 299,
      yearly: 2999,
    },
  },
  premium_qc_report: {
    slug: 'premium_qc_report',
    name: 'Premium AI QC Report',
    description: 'Enhanced AI QC reporting',
    type: 'qc_feature',
    dependsOnPlan: ['mid', 'enterprise'],
    pricing: {
      monthly: 399,
      yearly: 3999,
    },
  },
  multi_language_qc: {
    slug: 'multi_language_qc',
    name: 'Multi-language QC',
    description: 'QC across multiple languages',
    type: 'qc_feature',
    dependsOnPlan: ['mid', 'enterprise'],
    pricing: {
      monthly: 499,
      yearly: 4999,
    },
  },
  creative_qc_spi: {
    slug: 'creative_qc_spi',
    name: 'Creative QC (SPI) – Beta',
    description: 'AI-powered creative quality analysis: emotional impact, narrative structure, brand fit, and risk assessment',
    type: 'qc_feature',
    dependsOnPlan: ['enterprise'], // Enterprise only
    pricing: {
      monthly: 0, // Included in enterprise
      yearly: 0,
    },
  },
};

/**
 * Helper function to get plan config by slug
 */
export function getPlanConfig(slug: PlanSlug): PlanConfig {
  return PLANS[slug];
}

/**
 * Helper function to get addon config by slug
 */
export function getAddonConfig(slug: AddonSlug): AddonConfig {
  return ADDONS[slug];
}

/**
 * Helper function to check if a plan can use an addon
 */
export function canPlanUseAddon(planSlug: PlanSlug, addonSlug: AddonSlug): boolean {
  const addon = ADDONS[addonSlug];
  if (!addon.dependsOnPlan || addon.dependsOnPlan.length === 0) {
    return true; // Available to all plans
  }
  return addon.dependsOnPlan.includes(planSlug);
}

/**
 * Get all available addons for a plan
 */
export function getAvailableAddonsForPlan(planSlug: PlanSlug): AddonSlug[] {
  return Object.keys(ADDONS).filter((slug) =>
    canPlanUseAddon(planSlug, slug as AddonSlug)
  ) as AddonSlug[];
}

