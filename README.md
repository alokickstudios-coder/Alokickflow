# AlokickFlow

<div align="center">
  <h3>Premium Automated Media Supply Chain SaaS Platform</h3>
  <p>Enterprise-grade quality control and file management for post-production agencies</p>
</div>

---

## 🚀 Features

### Core Platform
- **Multi-tenant Architecture**: Secure data isolation for multiple organizations
- **Role-based Access Control**: Admin, Member, Vendor, and Viewer roles
- **Real-time Dashboard**: Live metrics with Supabase Realtime subscriptions
- **Beautiful UI**: Apple-style design with Framer Motion animations

### Quality Control
- **AI-Powered QC Analysis**: Gemini 2.0 Flash integration for intelligent media analysis
- **FFmpeg-based Checks**: Industry-standard technical validation
- **Bulk Processing**: Process multiple files concurrently
- **Comprehensive Reports**: Detailed QC reports with error categorization

#### QC Criteria
- Audio Missing Detection
- Missing Dialogue Analysis
- Lip-Sync Error Detection
- Loudness Compliance (EBU R128)
- Subtitle/SRT Validation
- Video Glitch Detection
- Missing BGM Analysis
- Visual Quality Assessment

### File Management
- **Direct Uploads**: Drag-and-drop file uploads with progress tracking
- **Filename Validation**: Regex-based naming convention enforcement
- **Google Drive Integration**: OAuth2 + full Drive API support
- **Cloudflare R2**: Cost-efficient S3-compatible storage option

### Vendor Management
- **Vendor Portal**: Dedicated dashboard for vendors
- **Drive Assignments**: Assign Google Drive links to vendors (sanitized)
- **Work Tracking**: Status updates and due dates
- **Real-time Notifications**: Push notifications for assignments and QC results

### Subscription & Billing
- **Stripe Integration**: Secure payment processing
- **Tiered Plans**: Free, Pro, and Enterprise options
- **Usage Tracking**: Storage and API usage monitoring

---

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Shadcn/UI
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage / Cloudflare R2
- **AI**: Google Gemini 2.0 Flash
- **Payments**: Stripe
- **Animations**: Framer Motion
- **State**: Zustand + TanStack Query

---

## 📦 Installation

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account
- Google Cloud Console account (for Gemini & Drive API)
- Stripe account (for payments)

### 1. Clone & Install

```bash
git clone https://github.com/alokickstudios/alokickflow.git
cd alokickflow
npm install
```

### 2. Environment Setup

Copy the environment template:

```bash
cp .env.example .env.local
```

Configure your `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google Gemini AI (https://aistudio.google.com/app/apikey)
GEMINI_API_KEY=your_gemini_api_key

# Google Drive API (Google Cloud Console)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable
STRIPE_WEBHOOK_SECRET=your_webhook_secret

# Optional: Cloudflare R2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=alokickflow-assets

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Database Setup

Run the production schema in your Supabase SQL Editor:

```bash
# Copy the contents of supabase/production-schema.sql
# and run it in Supabase Dashboard > SQL Editor
```

### 4. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000`

---

## 🔑 API Keys Setup

### Google Gemini API
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Add to `GEMINI_API_KEY`

### Google Drive API
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project
3. Enable Google Drive API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/api/google/callback`
6. Copy Client ID and Secret to `.env.local`

### Stripe
1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Get API keys from Developers section
3. Set up webhook endpoint: `https://your-domain.com/api/stripe/webhook`

---

## 📁 Project Structure

```
alokickflow/
├── app/                      # Next.js App Router
│   ├── api/                  # API Routes
│   │   ├── auth/             # Authentication endpoints
│   │   ├── google/           # Google Drive OAuth & operations
│   │   ├── qc/               # QC processing endpoints
│   │   ├── stripe/           # Payment webhooks
│   │   └── cron/             # Scheduled jobs
│   ├── dashboard/            # Protected dashboard pages
│   │   ├── assignments/      # Drive assignment management
│   │   ├── deliveries/       # File deliveries
│   │   ├── my-work/          # Vendor work view
│   │   ├── projects/         # Project management
│   │   ├── qc/               # QC results & bulk processing
│   │   ├── settings/         # User & org settings
│   │   ├── team/             # Team management
│   │   └── vendors/          # Vendor management
│   ├── login/                # Authentication pages
│   └── register/
├── components/               # React Components
│   ├── dashboard/            # Dashboard-specific components
│   ├── drive/                # Google Drive components
│   ├── qc/                   # QC-related components
│   ├── ui/                   # Shadcn/UI components
│   └── upload/               # File upload components
├── lib/                      # Utilities & Services
│   ├── ai/                   # Gemini AI integration
│   ├── google-drive/         # Drive API client
│   ├── logging/              # Logging service
│   ├── notifications/        # Real-time notifications
│   ├── qc/                   # FFmpeg QC checks
│   ├── storage/              # Cloudflare R2 client
│   └── supabase/             # Supabase clients
├── supabase/                 # Database schemas
│   └── production-schema.sql # Complete DB schema
└── types/                    # TypeScript definitions
```

---

## 🚀 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

The project includes `vercel.json` with optimized settings:
- Extended function timeouts for QC processing
- Cron job configuration
- CORS headers

### Manual Deployment

```bash
npm run build
npm run start
```

---

## 🔄 Cron Jobs

The application includes automated maintenance tasks:

- **Daily Cleanup** (3 AM): Cleans old notifications, audit logs, and temp files
- Configured in `vercel.json` for Vercel deployment

---

## 📊 Dashboard Features

### Admin Dashboard
- Real-time metrics (deliveries, QC pass rate, storage)
- Recent deliveries with status
- Quick file upload
- Project and vendor management

### Vendor Dashboard
- Assigned work view
- Sanitized Google Drive links (no client info)
- Status updates
- File upload capability

---

## 🔒 Security

- Row Level Security (RLS) on all Supabase tables
- Service role key for server-side operations only
- OAuth2 for Google Drive
- Encrypted token storage
- HTTPS enforced in production

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## 📄 License

MIT License - see LICENSE file for details

---

## 📞 Support

- **Email**: support@alokickstudios.com
- **Documentation**: [docs.alokickflow.com](https://docs.alokickflow.com)
- **Issues**: [GitHub Issues](https://github.com/alokickstudios/alokickflow/issues)

---

<div align="center">
  <p>Built with ❤️ by <a href="https://alokickstudios.com">Alokick Studios</a></p>
</div>
