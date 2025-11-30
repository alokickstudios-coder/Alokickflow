# AlokickFlow - Deployment Guide

## Prerequisites

- Node.js 18+ installed
- Supabase account and project
- Stripe account (for payments)
- Redis instance (for BullMQ/queue)
- FFmpeg installed on server (for QC processing)

## Environment Variables

Create a `.env.local` file with the following variables:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# Redis (for BullMQ)
REDIS_URL=redis://localhost:6379

# App
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

## Supabase Setup

### 1. Run Database Schema

Execute the SQL in `supabase/schema.sql` in your Supabase SQL Editor:
- Creates all tables with RLS policies
- Sets up multi-tenant architecture
- Configures indexes and triggers

### 2. Create Storage Buckets

Create the following buckets in Supabase Storage:

**deliveries** bucket:
```sql
-- RLS Policy for deliveries bucket
CREATE POLICY "Users can upload to their organization folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'deliveries' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can view their organization files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'deliveries' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM profiles WHERE id = auth.uid()
  )
);
```

### 3. Configure Authentication

In Supabase Dashboard → Authentication → Settings:
- Enable Email authentication
- Configure email templates
- Set redirect URLs:
  - Site URL: `https://yourdomain.com`
  - Redirect URLs: `https://yourdomain.com/auth/callback`

### 4. Enable Realtime (Optional)

For real-time updates, enable Realtime for these tables:
- `deliveries`
- `projects`
- `profiles`

## Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Deployment Options

### Vercel (Recommended)

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

```bash
# Or use Vercel CLI
npm i -g vercel
vercel
```

### Docker

```bash
# Build Docker image
docker build -t alokickflow .

# Run container
docker run -p 3000:3000 --env-file .env.local alokickflow
```

### Manual Server Deployment

```bash
# Build application
npm run build

# Install PM2 for process management
npm i -g pm2

# Start with PM2
pm2 start npm --name "alokickflow" -- start

# Save PM2 configuration
pm2 save
pm2 startup
```

## Post-Deployment Checklist

- [ ] Verify database migrations
- [ ] Test authentication flow
- [ ] Test file uploads
- [ ] Verify storage bucket access
- [ ] Test QC processing
- [ ] Configure Stripe webhooks
- [ ] Set up monitoring/logging
- [ ] Configure backups
- [ ] Test email delivery
- [ ] Verify RLS policies
- [ ] Load test critical paths
- [ ] Set up CI/CD pipeline

## Stripe Integration

1. Create products in Stripe Dashboard:
   - Free tier (0/month)
   - Pro tier (e.g., $49/month)
   - Enterprise tier (e.g., $199/month)

2. Configure webhooks:
   - Endpoint: `https://yourdomain.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

3. Copy webhook secret to environment variables

## FFmpeg Server Setup

For QC processing, ensure FFmpeg is installed:

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg

# MacOS
brew install ffmpeg

# Verify installation
ffmpeg -version
```

## Monitoring & Logging

Recommended tools:
- **Application Monitoring**: Sentry, LogRocket
- **Analytics**: PostHog, Mixpanel
- **Uptime Monitoring**: Better Uptime, UptimeRobot
- **Error Tracking**: Sentry
- **Performance**: Vercel Analytics, Google Lighthouse

## Security Checklist

- [ ] Environment variables secured
- [ ] RLS policies tested
- [ ] API rate limiting configured
- [ ] CORS configured properly
- [ ] HTTPS enabled
- [ ] CSP headers configured
- [ ] Input validation on all forms
- [ ] SQL injection prevention (using Supabase)
- [ ] File upload restrictions enforced
- [ ] Authentication tokens secured

## Scaling Considerations

- Use CDN for static assets (Vercel handles this)
- Implement Redis caching for frequent queries
- Use connection pooling for database
- Implement job queue for heavy processing
- Consider serverless functions for QC processing
- Monitor database query performance
- Implement pagination on large datasets

## Support & Maintenance

- Monitor error logs daily
- Review user feedback
- Update dependencies monthly
- Backup database weekly
- Test restore procedures
- Document incidents
- Plan feature releases

## Troubleshooting

### File uploads failing
- Check storage bucket RLS policies
- Verify organization_id in storage path
- Check file size limits

### Authentication issues
- Verify Supabase URL and keys
- Check redirect URLs configuration
- Review RLS policies on profiles table

### QC processing not working
- Verify FFmpeg installation
- Check file permissions
- Review worker logs
- Verify storage bucket access

## Cost Estimation

**Supabase:**
- Free tier: Up to 500MB database, 1GB storage
- Pro: $25/month (8GB database, 100GB storage)

**Vercel:**
- Hobby: Free (personal projects)
- Pro: $20/month per member

**Stripe:**
- 2.9% + $0.30 per transaction

**Total minimum:** ~$50/month for production use

## Next Steps

1. Set up staging environment
2. Configure CI/CD pipeline
3. Implement feature flags
4. Set up user analytics
5. Create admin dashboard
6. Build API documentation
7. Implement webhooks for integrations

