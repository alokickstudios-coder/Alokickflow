# Bulk QC Analysis Feature

## Overview

AI-powered bulk quality control system for video and SRT subtitle files. Supports concurrent processing for multiple users.

## Features

### 1. Bulk Upload Component (`/components/qc/bulk-upload.tsx`)
- Drag-and-drop file upload
- Support for video files (MP4, MOV, AVI, etc.) and subtitle files (SRT, VTT)
- File preview with size information
- Multiple file selection
- Real-time upload progress

### 2. QC Checks (Industry Standards)

All checks follow industry-standard QC criteria:

#### Video File Checks:
1. **Audio Missing** - Detects if video file has no audio track
2. **Missing Dialogue** - Detects extended silence (>10 seconds)
3. **Lip-Sync Error** - Checks audio-video synchronization (threshold: 100ms)
4. **Music and Dialogue Mix Loudness** - EBU R128 standard (-23 LUFS ± 1 LU)
5. **Video Glitches** - Detects frame drops, corruption, unusual frame rates
6. **Missing BGM** - Analyzes audio channels and levels to detect missing background music

#### SRT Subtitle File Checks:
1. **Subtitle Errors** - Invalid timestamps, HTML tags, formatting issues
2. **Subtitle Warnings** - Long display times (>7s), short display times (<0.5s), text length (>42 chars)

### 3. Processing System

- **API Route** (`/app/api/qc/bulk-process/route.ts`)
  - Handles file uploads
  - Creates delivery records
  - Queues QC jobs for processing
  - Supports concurrent processing

- **FFmpeg Checks** (`/lib/qc/ffmpeg-checks.ts`)
  - Industry-standard FFmpeg/FFprobe commands
  - Parallel check execution for performance
  - Detailed error reporting with timestamps

### 4. Results Table (`/app/dashboard/qc/bulk/page.tsx`)

Comprehensive results table with:
- **Project Name** - Organization project code and name
- **File Name** - Original filename
- **File Number** - Sequential numbering
- **Status** - Passed/Failed/Processing with visual indicators
- **Errors Caught** - Detailed list of all QC errors found
- **Original File Link** - Direct link to download original file
- **Actions** - Download and view options

### 5. Concurrent Processing

- Multiple users can upload and process files simultaneously
- Each job is processed independently
- Real-time status updates (polls every 5 seconds)
- No blocking between users

## Technical Implementation

### File Processing Flow

1. **Upload** → Files uploaded to Supabase Storage
2. **Delivery Record** → Created in database with "processing" status
3. **QC Job Queue** → Job added to processing queue
4. **FFmpeg Analysis** → All checks run in parallel
5. **Results Storage** → QC report saved to delivery record
6. **Status Update** → Delivery status updated (qc_passed/qc_failed)

### QC Check Details

#### Audio Missing
```bash
ffprobe -select_streams a:0 -show_entries stream=codec_type
```

#### Missing Dialogue
```bash
ffmpeg -af silencedetect=noise=-30dB:d=2
```

#### Lip-Sync Error
```bash
ffprobe -show_entries stream=start_time,codec_type
```

#### Loudness (EBU R128)
```bash
ffmpeg -af loudnorm=I=-23:TP=-2.0:LRA=7
```

#### Video Glitches
```bash
ffmpeg -f null (error detection)
```

### Database Schema

QC results stored in `deliveries` table:
- `qc_report` (JSONB) - Full QC report with all checks
- `qc_errors` (JSONB) - Array of error objects
- `status` - Updated to qc_passed or qc_failed

### Error Format

```typescript
{
  type: "Audio Missing" | "Missing Dialogue" | "Lip-Sync Error" | etc.,
  message: "Detailed error description",
  timestamp: 0, // Time position in seconds
  severity: "error" | "warning"
}
```

## Usage

1. Navigate to `/dashboard/qc/bulk`
2. Drag and drop or select multiple video/SRT files
3. Click "Start Bulk QC Analysis"
4. Files are queued and processed automatically
5. View results in the table below
6. Click on any result to see detailed QC report

## Future Enhancements

- [ ] BullMQ integration for proper job queue management
- [ ] WebSocket updates for real-time status
- [ ] Export QC reports to PDF/CSV
- [ ] Batch download of failed files
- [ ] Custom QC criteria configuration
- [ ] Machine learning for advanced glitch detection
- [ ] Integration with video player for error visualization

## Requirements

- FFmpeg and FFprobe installed on server
- Supabase Storage bucket "deliveries" configured
- Sufficient server resources for concurrent processing

