# QC System Documentation

## Overview

The QC (Quality Control) system provides comprehensive automated quality checks for video and audio files. It's designed to work **immediately with free features** using only FFmpeg, and gracefully enables paid AI features when API keys are configured.

## Architecture

### Core Components

1. **QC Engine** (`lib/services/qc/engine.ts`)
   - Main orchestrator that coordinates all QC modules
   - Handles feature gating based on subscription
   - Calculates overall QC status and score

2. **Basic QC** (`lib/services/qc/basicQc.ts`)
   - **FREE** - Works immediately with FFmpeg only
   - Features:
     - Audio Missing detection
     - Loudness Compliance (EBU R128)
     - Silence & Missing Dialogue detection
     - Subtitle Timing validation
     - Missing BGM detection
     - Visual Quality checks

3. **Premium QC Modules**
   - **Lip-sync QC** (`lib/services/qc/lipSyncQc.ts`) - Requires `LIPSYNC_SERVICE_URL` and `LIPSYNC_API_KEY`
   - **Video Glitch QC** (`lib/services/qc/videoGlitchQc.ts`) - FREE (uses FFmpeg)
   - **BGM QC** (`lib/services/qc/bgmQc.ts`) - FREE (uses FFmpeg)
   - **Premium Report** (`lib/services/qc/premiumReport.ts`) - Requires `DEEPSEEK_API_KEY`

4. **Transcription Service** (`lib/services/qc/transcription.ts`)
   - Supports Groq Whisper (`GROQ_API_KEY`)
   - Supports Cloudflare Whisper (`CF_ACCOUNT_ID` + `CF_API_TOKEN`)
   - Gracefully falls back if not configured

5. **Provider Config** (`config/qcProviders.ts`)
   - Central configuration for external providers
   - Auto-detects available services from environment variables

## API Endpoints

### POST `/api/qc/start`
Start QC processing for an episode.

**Request:**
```json
{
  "episodeId": "ep-123",
  "seriesId": "series-456",
  "fileUrl": "https://...",
  "filePath": "/path/to/file.mp4", // Alternative to fileUrl
  "subtitlesPath": "/path/to/subtitles.srt", // Optional
  "deliveryId": "delivery-789" // Optional
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "job-123",
  "result": {
    "status": "passed",
    "score": 85,
    "basicQC": { ... },
    "lipSync": { ... },
    "videoGlitch": { ... },
    "bgm": { ... },
    "premiumReport": { ... }
  }
}
```

### POST `/api/qc/bulk-process`
Process multiple files uploaded via form data.

**Request:** FormData with `files` array

**Response:**
```json
{
  "success": true,
  "jobsQueued": 3,
  "jobs": [...]
}
```

### POST `/api/dev/runQcSample` (Dev only)
Test harness for running QC on sample files.

**Request:**
```json
{
  "filePath": "/path/to/test-video.mp4",
  "organisationId": "org-123", // Optional
  "seriesId": "series-456", // Optional
  "episodeId": "ep-789" // Optional
}
```

## Environment Variables

### Required (for free features)
- None! Free features work with just FFmpeg installed.

### Optional (for paid features)

**Transcription:**
- `GROQ_API_KEY` - For Groq Whisper transcription
- `CF_ACCOUNT_ID` + `CF_API_TOKEN` - For Cloudflare Whisper

**Premium Report:**
- `DEEPSEEK_API_KEY` - For AI-powered QC reports
- `DEEPSEEK_API_BASE_URL` - Optional, defaults to `https://api.deepseek.com`

**Lip-sync:**
- `LIPSYNC_SERVICE_URL` - URL of lip-sync service
- `LIPSYNC_API_KEY` - API key for lip-sync service

## Subscription Integration

The QC system respects subscription tiers:

- **Free Plan**: QC disabled (`qcLevel: 'none'`)
- **Mid Plan**: Basic QC enabled (`qcLevel: 'basic'`), 50 series included, overage charges apply
- **Enterprise Plan**: Full QC enabled (`qcLevel: 'full'`), unlimited usage, all add-ons enabled

Feature gating is handled by `subscriptionService.hasFeature()` and `getEnabledQCFeatures()`.

## Usage Example

```typescript
import { runQcForEpisode, getEnabledQCFeatures } from '@/lib/services/qc/engine';

// Get enabled features for organization
const features = await getEnabledQCFeatures(organisationId);

// Run QC
const result = await runQcForEpisode({
  organisationId: 'org-123',
  seriesId: 'series-456',
  episodeId: 'ep-789',
  fileInfo: {
    filePath: '/path/to/video.mp4',
    fileName: 'video.mp4',
    subtitlesPath: '/path/to/subtitles.srt', // Optional
  },
  featuresEnabled: features,
});

console.log(`QC Status: ${result.status}`);
console.log(`Score: ${result.score}/100`);
```

## Testing

### Manual Test
1. Place a test video file in `test-fixtures/sample-video.mp4`
2. Call `POST /api/dev/runQcSample` with the file path
3. Review the QC results

### Automated Test
```bash
# Run QC on sample file
curl -X POST http://localhost:3000/api/dev/runQcSample \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "/path/to/test-video.mp4"
  }'
```

## Error Handling

All paid features gracefully degrade when API keys are missing:
- Transcription: Returns `null`, basic QC continues without transcript
- Lip-sync: Returns `{ status: 'skipped', skipReason: '...' }`
- Premium Report: Falls back to basic report generation

The QC engine never fails completely due to missing paid features - it always completes with available free features.

## Performance

- Basic QC typically takes 10-30 seconds per file (depends on file size and FFmpeg performance)
- Premium features add 5-15 seconds each
- All checks run in parallel where possible

## Troubleshooting

### FFmpeg not found
Ensure FFmpeg is installed and available in PATH:
```bash
ffmpeg -version
ffprobe -version
```

### QC fails silently
Check server logs for detailed error messages. Common issues:
- File path incorrect
- Insufficient disk space in temp directory
- FFmpeg filters not available

### Paid features not working
1. Check environment variables are set
2. Verify API keys are valid
3. Check provider config: `GET /api/dev/runQcSample` shows detected providers

## Future Enhancements

- Queue system (BullMQ) for async processing
- Real-time progress updates via WebSocket
- Batch processing optimization
- Custom QC rule configuration per organization
- Multi-language QC support



