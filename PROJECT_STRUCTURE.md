# AlokickFlow Project Structure

## Complete Folder Structure

```
alokickflow/
├── app/                          # Next.js 14 App Router
│   ├── dashboard/                # Dashboard pages
│   │   ├── layout.tsx           # Dashboard layout with sidebar
│   │   └── page.tsx             # Main dashboard page
│   ├── globals.css              # Global styles with Apple-style theme
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Home page (redirects to dashboard)
│
├── components/                   # React components
│   ├── dashboard/               # Dashboard-specific components
│   │   ├── sidebar.tsx         # Collapsible sidebar navigation
│   │   ├── bento-grid.tsx      # Bento grid metrics cards
│   │   └── recent-deliveries.tsx # Recent deliveries list
│   └── ui/                      # Shadcn/UI components
│       ├── button.tsx
│       ├── card.tsx
│       └── skeleton.tsx
│
├── lib/                         # Utility libraries
│   ├── supabase/                # Supabase clients
│   │   ├── client.ts           # Client-side Supabase client
│   │   └── server.ts           # Server-side Supabase client
│   └── utils.ts                # General utilities (cn function)
│
├── supabase/                     # Database schema
│   └── schema.sql              # Complete SQL schema with RLS policies
│
├── .env.example                 # Environment variables template
├── .gitignore
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

## Key Files Overview

### 1. Database Schema (`supabase/schema.sql`)
- **5 Core Tables:**
  - `organizations` - Multi-tenant organizations
  - `profiles` - User profiles with roles (super_admin, admin, qc, vendor)
  - `projects` - Projects with naming convention regex
  - `deliveries` - File uploads with QC reports (JSONB)
  - `audit_logs` - Activity tracking

- **Security Features:**
  - Row Level Security (RLS) enabled on all tables
  - Comprehensive policies for multi-tenant data isolation
  - Users can only access data from their organization_id
  - Role-based access control (RBAC)

- **Performance:**
  - Indexes on foreign keys and frequently queried columns
  - Automatic `updated_at` triggers

### 2. Dashboard Components

#### Sidebar (`components/dashboard/sidebar.tsx`)
- Collapsible navigation with smooth Framer Motion animations
- Persistent state via localStorage
- Active route highlighting with animated indicator
- Apple-style glassmorphism design

#### Bento Grid (`components/dashboard/bento-grid.tsx`)
- 4 metric cards: Storage, Deliveries, QC Pass Rate, Failed QC
- Loading skeletons for smooth UX
- Trend indicators with color coding
- Responsive grid layout

#### Recent Deliveries (`components/dashboard/recent-deliveries.tsx`)
- List of recent file uploads
- Status badges with icons
- Staggered animations
- Hover effects

### 3. Styling System

#### Global Styles (`app/globals.css`)
- Dark mode default (Zinc 950 background)
- Glassmorphism utility classes
- Smooth transitions
- Inter font integration

#### Tailwind Config (`tailwind.config.ts`)
- Shadcn/UI color system
- Custom animations
- Responsive breakpoints

### 4. Supabase Integration

#### Client (`lib/supabase/client.ts`)
- Browser-side Supabase client
- Auto-refresh tokens
- Session persistence

#### Server (`lib/supabase/server.ts`)
- Server-side Supabase client
- Cookie-based session management
- SSR compatible

## Design System

### Colors
- **Background:** Zinc 950 (dark mode default)
- **Cards:** Zinc 900/50 with glassmorphism
- **Borders:** Zinc 800/50 (subtle)
- **Text:** White (primary), Zinc 400 (secondary)

### Typography
- **Font:** Inter (Google Fonts)
- **Sizes:** Responsive scale
- **Weights:** 400 (regular), 500 (medium), 600 (semibold)

### Effects
- **Glassmorphism:** `bg-zinc-900/50 backdrop-blur-xl`
- **Borders:** `border-zinc-800/50`
- **Transitions:** 150ms cubic-bezier
- **Animations:** Framer Motion for smooth transitions

## Next Implementation Steps

1. **Authentication Flow**
   - Login/Register pages
   - Organization creation on signup
   - Vendor invitation system

2. **File Upload**
   - Drag-and-drop zone
   - Filename validation
   - Resumable uploads to Supabase Storage

3. **QC Pipeline**
   - FFmpeg worker setup
   - QC checks (format, duration, loudness, clipping)
   - Report generation

4. **QC Player**
   - Custom video/audio player
   - Waveform visualization (wavesurfer.js)
   - Error markers on timeline

5. **Stripe Integration**
   - Subscription management
   - Payment processing
   - Tier-based features

## Database Schema Highlights

### Multi-Tenancy
Every table includes `organization_id` for complete data isolation.

### QC Reports
Stored as JSONB in `deliveries.qc_report`:
```json
{
  "status": "failed",
  "format": { "container": "mov", "codec": "h264" },
  "loudness": { "value": -18, "target": -23 },
  "errors": [
    { "type": "loudness", "message": "Exceeds target", "timestamp": 260 }
  ]
}
```

### RLS Policies
- Users can only SELECT data from their organization
- Admins can INSERT/UPDATE in their organization
- Vendors can only INSERT their own deliveries
- System operations use service role key

