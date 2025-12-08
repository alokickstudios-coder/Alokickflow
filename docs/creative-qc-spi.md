# Creative QC (SPI) - Semantic Provenance Intelligence

## Overview

Creative QC (SPI) is an **Enterprise-only beta feature** that uses AI to analyze the emotional, narrative, and creative quality aspects of media content. Unlike technical QC checks (audio levels, video glitches, etc.), Creative QC focuses on the subjective creative elements that determine viewer engagement and brand alignment.

## Provider Stack

Creative QC uses the following providers:

| Component | Provider | Purpose |
|-----------|----------|---------|
| **Transcription** | Groq Whisper | Converts audio/video to text |
| **SPI Analysis** | DeepSeek | Creative/emotional analysis |

> **Note**: This system does NOT use Gemini. All analysis is performed via Groq + DeepSeek.

## What Creative QC Measures

Creative QC analyzes content across **7 categories** with **35+ parameters**:

### A. Story & Structure
| Parameter | Description | Scale |
|-----------|-------------|-------|
| `narrative_arc` | How clearly the story progresses from beginning to end | 0-100 (higher = better) |
| `clarity_of_premise` | How clear and understandable the main idea is | 0-100 (higher = better) |
| `pacing_rhythm` | Whether the story feels rushed, slow, or well-balanced | 0-100 (higher = better) |
| `hook_strength` | Strength of opening and early attention capture | 0-100 (higher = better) |
| `structural_coherence` | Logical flow between scenes/segments | 0-100 (higher = better) |
| `ending_resolution` | How satisfactorily the story resolves | 0-100 (higher = better) |

### B. Character & Voice
| Parameter | Description | Scale |
|-----------|-------------|-------|
| `character_depth` | Perceived depth and complexity of key characters | 0-100 (higher = better) |
| `character_consistency` | Consistency of traits, tone, and actions | 0-100 (higher = better) |
| `dialogue_naturalness` | How natural and believable the dialogue feels | 0-100 (higher = better) |
| `voice_consistency` | Consistency of narrative or brand voice | 0-100 (higher = better) |

### C. Emotion & Engagement
| Parameter | Description | Scale |
|-----------|-------------|-------|
| `emotional_intensity` | Strength of emotional charge | 0-100 (higher = better) |
| `emotional_variability` | Range and progression of emotions over time | 0-100 (higher = better) |
| `empathy_alignment` | How easy it is to empathize with protagonist/POV | 0-100 (higher = better) |
| `suspense_tension` | Level of tension, curiosity, or anticipation | 0-100 (higher = better) |
| `humour_delivery` | Effectiveness of humour, if applicable | 0-100 (higher = better) |
| `relatability` | How relatable the situation and characters are | 0-100 (higher = better) |

### D. Platform & Audience Fit
| Parameter | Description | Scale |
|-----------|-------------|-------|
| `target_audience_fit` | Alignment with the intended audience profile | 0-100 (higher = better) |
| `platform_format_fit` | Fit with platform constraints (short/long-form, etc.) | 0-100 (higher = better) |
| `scroll_stopping_power` | Likelihood of stopping scroll/keeping user | 0-100 (higher = better) |
| `retention_potential` | Likely ability to retain viewer through runtime | 0-100 (higher = better) |

### E. Brand & Intent Alignment
| Parameter | Description | Scale |
|-----------|-------------|-------|
| `brand_voice_match` | How well content matches brand's established voice | 0-100 (higher = better) |
| `message_clarity` | Clarity of the main message or value proposition | 0-100 (higher = better) |
| `call_to_action_clarity` | How clear and compelling the CTA is (when present) | 0-100 (higher = better) |
| `credibility_trust` | Perceived trustworthiness and non-gimmicky feel | 0-100 (higher = better) |

### F. Risk, Safety & Compliance
| Parameter | Description | Scale |
|-----------|-------------|-------|
| `safety_sensitivity_risk` | Risk of sensitive/offensive themes | 0-100 (higher = **more risk**) |
| `toxicity_risk` | Risk of toxic, hateful, or abusive language | 0-100 (higher = **more risk**) |
| `misleading_claims_risk` | Risk of exaggerated or misleading claims | 0-100 (higher = **more risk**) |
| `brand_safety_overall` | Overall brand safety level | 0-100 (higher = safer) |

### G. Perceived Craft Quality
| Parameter | Description | Scale |
|-----------|-------------|-------|
| `audio_clarity_perception` | Perceived clarity of speech and main audio | 0-100 (higher = better) |
| `music_mood_alignment` | How well music matches narrative mood | 0-100 (higher = better) |
| `sound_design_impact` | Perceived quality and impact of sound design | 0-100 (higher = better) |
| `visual_composition_perception` | Perceived quality of framing and visual storytelling | 0-100 (higher = better) |
| `edit_flow_smoothness` | Perceived smoothness of edits and transitions | 0-100 (higher = better) |

---

## Environment Variables

### Required Variables

| Variable | Description | Example Format | Used By |
|----------|-------------|----------------|---------|
| `GROQ_API_KEY` | Your Groq Cloud API key | `gsk_xxxxxxxxxxxxxxxxxxxx` | Groq Whisper transcription |
| `DEEPSEEK_API_KEY` | Your DeepSeek API key | `sk-xxxxxxxxxxxxxxxxxxxx` | DeepSeek SPI analysis |

### Optional Variables

| Variable | Description | Default | Used By |
|----------|-------------|---------|---------|
| `GROQ_API_BASE` | Groq API base URL | `https://api.groq.com/openai/v1` | Groq Whisper |
| `GROQ_WHISPER_MODEL` | Whisper model name | `whisper-large-v3-turbo` | Groq Whisper |
| `DEEPSEEK_API_BASE` | DeepSeek API base URL | `https://api.deepseek.com/v1` | DeepSeek SPI |
| `DEEPSEEK_MODEL_NAME` | DeepSeek model name | `deepseek-chat` | DeepSeek SPI |
| `DEEPSEEK_TIMEOUT_MS` | Analysis timeout in ms | `120000` (2 min) | DeepSeek SPI |

### Where These Variables Are Read

- `GROQ_API_KEY`: `lib/services/spi/providers/groqWhisper.ts`
- `DEEPSEEK_API_KEY`: `lib/services/spi/providers/deepseekSpi.ts`
- Both are read at runtime when Creative QC analysis is triggered

---

## Database Schema (Supabase SQL)

Run this SQL in your **Supabase SQL Editor**:

```sql
-- =====================================================
-- Creative QC (SPI) Schema Migration
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Add Creative QC columns to qc_jobs table
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_status TEXT DEFAULT NULL
  CHECK (creative_qc_status IN ('pending', 'running', 'completed', 'failed', NULL));

ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_overall_score INTEGER DEFAULT NULL;
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_overall_risk_score INTEGER DEFAULT NULL;
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_overall_brand_fit_score INTEGER DEFAULT NULL;

ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_parameters JSONB DEFAULT NULL;
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_summary TEXT DEFAULT NULL;
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_recommendations JSONB DEFAULT NULL;
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_error TEXT DEFAULT NULL;

ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_started_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE qc_jobs ADD COLUMN IF NOT EXISTS creative_qc_completed_at TIMESTAMPTZ DEFAULT NULL;

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_qc_jobs_creative_qc_status ON qc_jobs(creative_qc_status);

-- 2. Add Creative QC settings to organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS creative_qc_settings JSONB DEFAULT NULL;

-- 3. Create feature_flags table if not exists
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

-- Enable RLS
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- 4. Create audit log table
CREATE TABLE IF NOT EXISTS creative_qc_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  job_id UUID REFERENCES qc_jobs(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  performed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_qc_audit_org ON creative_qc_audit_log(organization_id, created_at DESC);

ALTER TABLE creative_qc_audit_log ENABLE ROW LEVEL SECURITY;

-- Done!
SELECT 'Creative QC schema migration completed!' AS status;
```

---

## Pipeline Flow

Here's how a Creative QC request flows through the system:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CREATIVE QC PIPELINE FLOW                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Step 1: Preconditions Check                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ • User belongs to Enterprise plan? ────────────► No → Skip      │   │
│  │ • creative_qc_spi feature flag enabled? ───────► No → Skip      │   │
│  │ • Creative QC toggle ON for org? ──────────────► No → Skip      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ↓ All Yes                                  │
│                                                                         │
│  Step 2: QC Job Created                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ • Job inserted into qc_jobs table                               │   │
│  │ • creative_qc_status = 'pending' (if Creative QC enabled)       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│                                                                         │
│  Step 3: Technical QC Runs (existing pipeline)                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ • Audio checks, video checks, subtitle checks, etc.             │   │
│  │ • Results stored in result_json                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│                                                                         │
│  Step 4: Get Transcript                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Has transcript or subtitles? ─────────────────► Yes → Use it    │   │
│  │           ↓ No                                                  │   │
│  │ Has audio/video media? ───────────────────────► Yes → Step 4a   │   │
│  │           ↓ No                                                  │   │
│  │ Skip Creative QC (no content to analyze)                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Step 4a: Groq Whisper Transcription                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ • Call Groq API: POST /audio/transcriptions                     │   │
│  │ • Model: whisper-large-v3-turbo                                 │   │
│  │ • Returns: transcript text + segments                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│                                                                         │
│  Step 5: DeepSeek SPI Analysis                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ • Call DeepSeek API: POST /chat/completions                     │   │
│  │ • Model: deepseek-chat (or deepseek-r1)                         │   │
│  │ • Input: transcript + metadata + context                        │   │
│  │ • Output: JSON with 35 parameter scores + explanations          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│                                                                         │
│  Step 6: Store Results                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ UPDATE qc_jobs SET                                              │   │
│  │   creative_qc_status = 'completed',                             │   │
│  │   creative_qc_overall_score = 75,                               │   │
│  │   creative_qc_overall_risk_score = 15,                          │   │
│  │   creative_qc_overall_brand_fit_score = 82,                     │   │
│  │   creative_qc_parameters = {...},                               │   │
│  │   creative_qc_summary = '...',                                  │   │
│  │   creative_qc_recommendations = [...]                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│                                                                         │
│  Step 7: Display in UI                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ • QC Results table shows Creative QC score column               │   │
│  │ • Click row → Detail modal with full parameter breakdown        │   │
│  │ • Risk scores highlighted if high                               │   │
│  │ • Recommendations shown for improvement                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## How to Configure Supabase

### Setting Environment Variables

**Option 1: Supabase Dashboard (for Edge Functions)**

1. Go to your Supabase project → Settings → Edge Functions
2. Add secrets:
   - `GROQ_API_KEY` = your Groq API key
   - `DEEPSEEK_API_KEY` = your DeepSeek API key

**Option 2: Vercel Dashboard (for Next.js deployment)**

1. Go to your Vercel project → Settings → Environment Variables
2. Add:
   - `GROQ_API_KEY` = your Groq API key
   - `DEEPSEEK_API_KEY` = your DeepSeek API key
3. Redeploy

**Option 3: Local Development (.env.local)**

```bash
# Creative QC Providers
GROQ_API_KEY=gsk_your_groq_api_key_here
DEEPSEEK_API_KEY=sk_your_deepseek_api_key_here

# Optional overrides
GROQ_WHISPER_MODEL=whisper-large-v3-turbo
DEEPSEEK_MODEL_NAME=deepseek-chat
```

### Which Components Need These Variables

| Component | Variables Needed |
|-----------|------------------|
| Next.js API routes (`/api/qc/creative/*`) | GROQ_API_KEY, DEEPSEEK_API_KEY |
| QC Worker (if processing Creative QC) | GROQ_API_KEY, DEEPSEEK_API_KEY |

---

## How to Enable Creative QC

### Step 1: Mark Organization as Enterprise

```sql
-- Option A: Update subscription_tier directly
UPDATE organizations 
SET subscription_tier = 'enterprise' 
WHERE id = 'YOUR_ORG_ID';

-- Option B: Or link to enterprise plan via subscriptions
INSERT INTO organisation_subscriptions (organisation_id, plan_id, status)
SELECT 'YOUR_ORG_ID', id, 'active'
FROM plans WHERE slug = 'enterprise';
```

### Step 2: Enable Feature Flag

```sql
INSERT INTO feature_flags (organization_id, feature_key, enabled)
VALUES ('YOUR_ORG_ID', 'creative_qc_spi', true)
ON CONFLICT (organization_id, feature_key) 
DO UPDATE SET enabled = true;
```

### Step 3: Enable in UI

1. Log in as a user from the Enterprise organization
2. Navigate to **QC Hub** (`/dashboard/qc`)
3. Find the **"Creative QC (SPI) – Beta"** toggle card
4. Click the toggle to enable
5. Accept the beta terms dialog

---

## Smoke Test Checklist

### Test 1: Basic Creative QC Flow

- [ ] Mark a test organization as Enterprise (see SQL above)
- [ ] Enable `creative_qc_spi` feature flag for that org
- [ ] Log in and navigate to QC Hub
- [ ] Verify Creative QC toggle is visible
- [ ] Enable Creative QC toggle (accept beta dialog)
- [ ] Upload a video/audio file WITH spoken content
- [ ] Wait for technical QC to complete
- [ ] Verify in database: `creative_qc_status` changes from `pending` → `running` → `completed`
- [ ] Verify `creative_qc_parameters` JSON is populated
- [ ] Verify QC Hub UI shows Creative QC score
- [ ] Click on job to see detailed parameter breakdown

### Test 2: Toggle OFF Behavior

- [ ] Turn OFF Creative QC toggle
- [ ] Submit a new QC job
- [ ] Verify NO Creative QC analysis runs
- [ ] `creative_qc_status` should remain NULL

### Test 3: Provider Status Check

- [ ] Call `GET /api/qc/creative/status`
- [ ] Verify response shows:
  - `transcription.name` = "groq_whisper"
  - `transcription.configured` = true
  - `spi.name` = "deepseek"
  - `spi.configured` = true

---

## API Endpoints

### GET /api/qc/creative/settings

Returns Creative QC availability, settings, and provider status.

**Response:**
```json
{
  "available": true,
  "availabilityReason": null,
  "settings": {
    "enabled": true,
    "betaAccepted": true,
    "platformType": "long_form"
  },
  "providers": {
    "transcription": { "name": "groq_whisper", "configured": true },
    "spi": { "name": "deepseek", "configured": true }
  },
  "categories": { ... },
  "totalParameters": 35
}
```

### POST /api/qc/creative/settings

Update Creative QC settings.

### POST /api/qc/creative/analyze

Manually trigger Creative QC analysis for a job.

**Body:**
```json
{ "jobId": "uuid", "forceRerun": false }
```

### GET /api/qc/creative/status

Check provider configuration status.

---

## Troubleshooting

### Creative QC not appearing in UI

1. Check organization is Enterprise: `SELECT subscription_tier FROM organizations WHERE id = 'YOUR_ORG_ID'`
2. Check feature flag: `SELECT * FROM feature_flags WHERE organization_id = 'YOUR_ORG_ID' AND feature_key = 'creative_qc_spi'`
3. Check `/api/qc/creative/status` endpoint for provider configuration

### Analysis fails with "provider not configured"

1. Verify `GROQ_API_KEY` is set
2. Verify `DEEPSEEK_API_KEY` is set
3. Redeploy after adding environment variables

### Analysis fails with timeout

1. Increase `DEEPSEEK_TIMEOUT_MS` (default: 120000)
2. Check transcript isn't too long (>30k chars may timeout)

### No transcript generated

1. Ensure media file has audio content
2. Check Groq API key is valid
3. Check file size is under 25MB (Groq limit)

---

## Code Files Reference

| File | Purpose |
|------|---------|
| `config/creativeQcConfig.ts` | Parameter definitions and scoring |
| `lib/services/spi/engine.ts` | Main SPI engine (orchestrates providers) |
| `lib/services/spi/providers/types.ts` | Provider interfaces |
| `lib/services/spi/providers/groqWhisper.ts` | Groq Whisper implementation |
| `lib/services/spi/providers/deepseekSpi.ts` | DeepSeek implementation |
| `lib/services/spi/providers/index.ts` | Provider factory |
| `app/api/qc/creative/settings/route.ts` | Settings API |
| `app/api/qc/creative/analyze/route.ts` | Analysis API |
| `app/api/qc/creative/status/route.ts` | Status/diagnostic API |
| `components/qc/creative-qc-toggle.tsx` | UI toggle component |
| `components/qc/creative-qc-results.tsx` | Results display component |

---

## Go-Live Checklist

```markdown
### Pre-Deployment

- [ ] Get Groq API key from https://console.groq.com/
- [ ] Get DeepSeek API key from https://platform.deepseek.com/
- [ ] Set GROQ_API_KEY in Vercel environment variables
- [ ] Set DEEPSEEK_API_KEY in Vercel environment variables

### Database Migration

- [ ] Run creative-qc-schema.sql in Supabase SQL Editor

### Deployment

- [ ] git add . && git commit -m "Add Creative QC (SPI)"
- [ ] git push origin main
- [ ] Verify Vercel deployment succeeds

### Testing

- [ ] Mark test org as Enterprise (SQL)
- [ ] Enable creative_qc_spi feature flag (SQL)
- [ ] Enable toggle in UI
- [ ] Run test QC job
- [ ] Verify results appear in UI

### Production Rollout

- [ ] Enable for production Enterprise accounts as needed
```
