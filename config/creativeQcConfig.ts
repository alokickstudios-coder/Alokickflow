/**
 * Creative QC (SPI) Configuration
 * 
 * Central configuration for Semantic Provenance Intelligence (SPI) parameters.
 * This module defines all creative quality parameters used for analyzing
 * emotional, narrative, and creative aspects of audio/video content.
 * 
 * Enterprise-only feature behind beta toggle.
 */

export type CreativeQCCategory = 
  | 'story_structure'
  | 'character_voice'
  | 'emotion_engagement'
  | 'platform_audience'
  | 'brand_intent'
  | 'risk_safety'
  | 'perceived_craft'
  | 'summary';

export type ScoreDirection = 'higher_is_better' | 'higher_is_risk';

export interface CreativeQCParameter {
  key: string;
  label: string;
  category: CreativeQCCategory;
  description: string;
  scale: { min: number; max: number };
  direction: ScoreDirection;
  weight: number; // Weight for overall score calculation (0-1)
}

export interface CreativeQCParameterResult {
  key: string;
  label: string;
  category: CreativeQCCategory;
  score: number;
  explanation: string;
  direction: ScoreDirection;
}

export interface CreativeQCResult {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  overall_creative_score: number;
  overall_risk_score: number;
  overall_brand_fit_score: number;
  parameters: Record<string, CreativeQCParameterResult>;
  summary: string;
  recommendations: string[];
  raw_response?: any; // Debug field for raw AI response
  error?: string;
  processed_at: string;
  processing_time_ms: number;
}

/**
 * Full Creative QC Parameter Registry
 * 
 * This is the canonical source of all creative QC parameters.
 * Both the pipeline and UI reference this configuration.
 */
export const CREATIVE_QC_PARAMETERS: CreativeQCParameter[] = [
  // ============================================
  // A. Story & Structure
  // ============================================
  {
    key: 'narrative_arc',
    label: 'Narrative Arc',
    category: 'story_structure',
    description: 'How clearly the story progresses from beginning to end with a satisfying arc.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.08,
  },
  {
    key: 'clarity_of_premise',
    label: 'Clarity of Premise',
    category: 'story_structure',
    description: 'How clear and understandable the main idea or premise is to the viewer.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.07,
  },
  {
    key: 'pacing_rhythm',
    label: 'Pacing & Rhythm',
    category: 'story_structure',
    description: 'Whether the story feels rushed, slow, or well-balanced throughout.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.06,
  },
  {
    key: 'hook_strength',
    label: 'Hook Strength',
    category: 'story_structure',
    description: 'Strength of opening and early attention capture in the first few seconds.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.08,
  },
  {
    key: 'structural_coherence',
    label: 'Structural Coherence',
    category: 'story_structure',
    description: 'Logical flow and smooth transitions between scenes/segments.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.05,
  },
  {
    key: 'ending_resolution',
    label: 'Ending Resolution',
    category: 'story_structure',
    description: 'How satisfactorily the story resolves or concludes.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.05,
  },

  // ============================================
  // B. Character & Voice
  // ============================================
  {
    key: 'character_depth',
    label: 'Character Depth',
    category: 'character_voice',
    description: 'Perceived depth and complexity of key characters or personas.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.04,
  },
  {
    key: 'character_consistency',
    label: 'Character Consistency',
    category: 'character_voice',
    description: 'Consistency of character traits, tone, and actions throughout.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.04,
  },
  {
    key: 'dialogue_naturalness',
    label: 'Dialogue Naturalness',
    category: 'character_voice',
    description: 'How natural and believable the dialogue or narration feels.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.04,
  },
  {
    key: 'voice_consistency',
    label: 'Voice Consistency',
    category: 'character_voice',
    description: 'Consistency of narrative or brand voice throughout the content.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.04,
  },

  // ============================================
  // C. Emotion & Engagement
  // ============================================
  {
    key: 'emotional_intensity',
    label: 'Emotional Intensity',
    category: 'emotion_engagement',
    description: 'Strength and impact of emotional charge in the content.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.06,
  },
  {
    key: 'emotional_variability',
    label: 'Emotional Variability',
    category: 'emotion_engagement',
    description: 'Range and progression of emotions over time.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.04,
  },
  {
    key: 'empathy_alignment',
    label: 'Empathy Alignment',
    category: 'emotion_engagement',
    description: 'How easy it is to empathize with the protagonist or point of view.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.05,
  },
  {
    key: 'suspense_tension',
    label: 'Suspense & Tension',
    category: 'emotion_engagement',
    description: 'Level of tension, curiosity, or anticipation created.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.04,
  },
  {
    key: 'humour_delivery',
    label: 'Humour Delivery',
    category: 'emotion_engagement',
    description: 'Effectiveness of humour elements, if applicable.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.02,
  },
  {
    key: 'relatability',
    label: 'Relatability',
    category: 'emotion_engagement',
    description: 'How relatable the situation and characters are to the audience.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.04,
  },

  // ============================================
  // D. Platform & Audience Fit
  // ============================================
  {
    key: 'target_audience_fit',
    label: 'Target Audience Fit',
    category: 'platform_audience',
    description: 'Alignment with the intended audience profile and expectations.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.05,
  },
  {
    key: 'platform_format_fit',
    label: 'Platform Format Fit',
    category: 'platform_audience',
    description: 'Fit with platform constraints (short-form, long-form, episodic).',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.04,
  },
  {
    key: 'scroll_stopping_power',
    label: 'Scroll-Stopping Power',
    category: 'platform_audience',
    description: 'Likelihood of stopping scroll and capturing attention (for social media).',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.05,
  },
  {
    key: 'retention_potential',
    label: 'Retention Potential',
    category: 'platform_audience',
    description: 'Likely ability to retain viewer/listener through the runtime.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.05,
  },

  // ============================================
  // E. Brand & Intent Alignment
  // ============================================
  {
    key: 'brand_voice_match',
    label: 'Brand Voice Match',
    category: 'brand_intent',
    description: "How well the content matches the brand's established voice.",
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.04,
  },
  {
    key: 'message_clarity',
    label: 'Message Clarity',
    category: 'brand_intent',
    description: 'Clarity of the main message or value proposition.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.05,
  },
  {
    key: 'call_to_action_clarity',
    label: 'Call-to-Action Clarity',
    category: 'brand_intent',
    description: 'How clear and compelling the call-to-action is (when present).',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.03,
  },
  {
    key: 'credibility_trust',
    label: 'Credibility & Trust',
    category: 'brand_intent',
    description: 'Perceived trustworthiness and non-gimmicky feel.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.04,
  },

  // ============================================
  // F. Risk, Safety & Compliance
  // ============================================
  {
    key: 'safety_sensitivity_risk',
    label: 'Safety Sensitivity Risk',
    category: 'risk_safety',
    description: 'Risk of sensitive or offensive themes (violence, self-harm, etc.).',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_risk',
    weight: 0.0, // Not included in overall creative score
  },
  {
    key: 'toxicity_risk',
    label: 'Toxicity Risk',
    category: 'risk_safety',
    description: 'Risk of toxic, hateful, or abusive language or subtext.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_risk',
    weight: 0.0,
  },
  {
    key: 'misleading_claims_risk',
    label: 'Misleading Claims Risk',
    category: 'risk_safety',
    description: 'Risk of exaggerated or misleading claims.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_risk',
    weight: 0.0,
  },
  {
    key: 'brand_safety_overall',
    label: 'Brand Safety Overall',
    category: 'risk_safety',
    description: 'Overall brand safety level.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better', // Higher = safer
    weight: 0.0, // Tracked separately
  },

  // ============================================
  // G. Perceived Craft Quality
  // ============================================
  {
    key: 'audio_clarity_perception',
    label: 'Audio Clarity Perception',
    category: 'perceived_craft',
    description: 'Perceived clarity of speech and main audio elements.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.03,
  },
  {
    key: 'music_mood_alignment',
    label: 'Music-Mood Alignment',
    category: 'perceived_craft',
    description: 'How well the music matches and enhances the narrative mood.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.03,
  },
  {
    key: 'sound_design_impact',
    label: 'Sound Design Impact',
    category: 'perceived_craft',
    description: 'Perceived quality and impact of sound effects and ambience.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.02,
  },
  {
    key: 'visual_composition_perception',
    label: 'Visual Composition',
    category: 'perceived_craft',
    description: 'Perceived quality of framing, composition, and visual storytelling.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.03,
  },
  {
    key: 'edit_flow_smoothness',
    label: 'Edit Flow & Smoothness',
    category: 'perceived_craft',
    description: 'Perceived smoothness of edits, transitions, and pacing.',
    scale: { min: 0, max: 100 },
    direction: 'higher_is_better',
    weight: 0.03,
  },
];

/**
 * Category metadata for UI grouping
 */
export const CREATIVE_QC_CATEGORIES: Record<CreativeQCCategory, { label: string; description: string; icon: string }> = {
  story_structure: {
    label: 'Story & Structure',
    description: 'Narrative arc, pacing, and structural elements',
    icon: 'BookOpen',
  },
  character_voice: {
    label: 'Character & Voice',
    description: 'Character development and narrative voice',
    icon: 'Users',
  },
  emotion_engagement: {
    label: 'Emotion & Engagement',
    description: 'Emotional impact and viewer engagement',
    icon: 'Heart',
  },
  platform_audience: {
    label: 'Platform & Audience',
    description: 'Platform fit and audience alignment',
    icon: 'Target',
  },
  brand_intent: {
    label: 'Brand & Intent',
    description: 'Brand alignment and message clarity',
    icon: 'Briefcase',
  },
  risk_safety: {
    label: 'Risk & Safety',
    description: 'Content safety and compliance risks',
    icon: 'Shield',
  },
  perceived_craft: {
    label: 'Perceived Craft Quality',
    description: 'Audio/visual craft and production quality perception',
    icon: 'Sparkles',
  },
  summary: {
    label: 'Summary',
    description: 'Overall creative quality metrics',
    icon: 'BarChart',
  },
};

/**
 * Get parameters grouped by category
 */
export function getParametersByCategory(): Record<CreativeQCCategory, CreativeQCParameter[]> {
  const grouped: Record<CreativeQCCategory, CreativeQCParameter[]> = {
    story_structure: [],
    character_voice: [],
    emotion_engagement: [],
    platform_audience: [],
    brand_intent: [],
    risk_safety: [],
    perceived_craft: [],
    summary: [],
  };

  for (const param of CREATIVE_QC_PARAMETERS) {
    grouped[param.category].push(param);
  }

  return grouped;
}

/**
 * Get a parameter by key
 */
export function getParameterByKey(key: string): CreativeQCParameter | undefined {
  return CREATIVE_QC_PARAMETERS.find((p) => p.key === key);
}

/**
 * Calculate overall creative score from parameter results
 */
export function calculateOverallCreativeScore(
  parameters: Record<string, CreativeQCParameterResult>
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const param of CREATIVE_QC_PARAMETERS) {
    if (param.weight > 0 && param.direction === 'higher_is_better') {
      const result = parameters[param.key];
      if (result && typeof result.score === 'number') {
        weightedSum += result.score * param.weight;
        totalWeight += param.weight;
      }
    }
  }

  if (totalWeight === 0) return 0;
  return Math.round(weightedSum / totalWeight);
}

/**
 * Calculate overall risk score from risk parameters
 */
export function calculateOverallRiskScore(
  parameters: Record<string, CreativeQCParameterResult>
): number {
  const riskParams = ['safety_sensitivity_risk', 'toxicity_risk', 'misleading_claims_risk'];
  let sum = 0;
  let count = 0;

  for (const key of riskParams) {
    const result = parameters[key];
    if (result && typeof result.score === 'number') {
      sum += result.score;
      count++;
    }
  }

  if (count === 0) return 0;
  return Math.round(sum / count);
}

/**
 * Calculate overall brand fit score
 */
export function calculateBrandFitScore(
  parameters: Record<string, CreativeQCParameterResult>
): number {
  const brandParams = ['brand_voice_match', 'message_clarity', 'call_to_action_clarity', 'credibility_trust', 'target_audience_fit'];
  let sum = 0;
  let count = 0;

  for (const key of brandParams) {
    const result = parameters[key];
    if (result && typeof result.score === 'number') {
      sum += result.score;
      count++;
    }
  }

  if (count === 0) return 0;
  return Math.round(sum / count);
}

/**
 * Default Creative QC settings for organizations
 */
export interface CreativeQCSettings {
  enabled: boolean;
  betaAccepted: boolean;
  customParameters?: string[]; // Subset of parameter keys to run
  targetAudience?: string;
  brandGuidelines?: string;
  platformType?: 'long_form' | 'short_form' | 'episodic' | 'social' | 'corporate';
}

export const DEFAULT_CREATIVE_QC_SETTINGS: CreativeQCSettings = {
  enabled: false,
  betaAccepted: false,
  customParameters: undefined,
  targetAudience: undefined,
  brandGuidelines: undefined,
  platformType: 'long_form',
};

