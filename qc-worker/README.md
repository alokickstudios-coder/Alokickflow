# AlokickFlow QC Worker

Dedicated video processing worker with FFmpeg for AlokickFlow QC system.

## Features

- Full FFmpeg-based video analysis
- Audio missing detection
- Loudness compliance (EBU R128)
- Silence & dialogue detection
- Visual quality checks
- Black frame detection
- Frozen frame detection
- BGM presence analysis

## Deployment on Railway (Free Tier)

### Step 1: Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### Step 2: Deploy from GitHub
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your AlokickFlow repo
4. Set the root directory to `qc-worker`

### Step 3: Configure Environment Variables
Add these variables in Railway dashboard:

| Variable | Description |
|----------|-------------|
| `PORT` | Leave empty (Railway sets automatically) |
| `WORKER_SECRET` | Generate a secure secret (e.g., `openssl rand -hex 32`) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service role key |

### Step 4: Get Worker URL
After deployment, copy the Railway URL (e.g., `https://your-app.railway.app`)

### Step 5: Configure Main App
Add to your Vercel environment:
```
QC_WORKER_URL=https://your-app.railway.app
QC_WORKER_SECRET=your-secret-from-step-3
```

## API Endpoints

### Health Check
```
GET /health
```

### FFmpeg Check
```
GET /ffmpeg-check
```

### Process QC Job
```
POST /qc/process
Authorization: Bearer <WORKER_SECRET>
Content-Type: application/json

{
  "fileUrl": "https://...",  // Direct URL or
  "storagePath": "path/in/supabase",  // Supabase storage path
  "fileName": "video.mp4",
  "jobData": { ... }  // Optional metadata
}
```

## Local Development

```bash
cd qc-worker
npm install
npm run dev
```

Requires FFmpeg installed locally:
- macOS: `brew install ffmpeg`
- Ubuntu: `apt-get install ffmpeg`
- Windows: Download from ffmpeg.org

## Free Tier Limits

Railway free tier includes:
- $5/month in credits
- Enough for ~100+ QC jobs per month
- Perfect for testing and demos
