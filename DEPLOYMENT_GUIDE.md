# Deployment Guide - AlokickFlow

## Pre-Deployment Checklist

### 1. Supabase Setup

#### A. Create Storage Bucket
```sql
-- In Supabase Dashboard > Storage
-- Create bucket: 'deliveries'
-- Make it private (RLS will handle access)
```

#### B. Run SQL Migrations
In order:
1. `supabase/schema.sql` - Main schema
2. `supabase/production-enhancements.sql` - RLS policies and enhancements

#### C. Configure Email Templates
In Supabase Dashboard > Authentication > Email Templates:
- Customize "Confirm Signup" template
- Customize "Reset Password" template
- Set "Site URL" to your production domain

### 2. Environment Variables

Create `.env.local` (already done) with:
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Stripe (when ready)
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# App
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### 3. Install Dependencies

```bash
npm install
# Add these if not already in package.json:
npm install @radix-ui/react-dropdown-menu
npm install @radix-ui/react-progress
```

### 4. Build and Test Locally

```bash
npm run build
npm start
```

Test these flows:
- [ ] Register new account
- [ ] Login
- [ ] Password reset
- [ ] Upload file
- [ ] Create project
- [ ] Invite vendor
- [ ] View QC results
- [ ] Logout

## Deployment Options

### Option 1: Vercel (Recommended)

1. **Connect Repository**
   ```bash
   # Install Vercel CLI
   npm i -g vercel
   
   # Deploy
   vercel
   ```

2. **Configure Environment Variables**
   - Go to Vercel Dashboard > Your Project > Settings > Environment Variables
   - Add all variables from `.env.local`

3. **Deploy to Production**
   ```bash
   vercel --prod
   ```

### Option 2: Self-Hosted (Docker)

Create `Dockerfile`:
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t alokickflow .
docker run -p 3000:3000 --env-file .env.local alokickflow
```

## Post-Deployment

### 1. Verify Deployment

Test all critical paths:
- Authentication flows
- File uploads
- Database operations
- Storage access

### 2. Set Up Monitoring

Recommended tools:
- **Sentry** - Error tracking
- **LogRocket** - Session replay
- **Vercel Analytics** - Performance monitoring

### 3. Configure DNS

Point your domain to deployment:
- Vercel: Add custom domain in dashboard
- Self-hosted: Configure A/CNAME records

### 4. Enable HTTPS

- Vercel: Automatic
- Self-hosted: Use Let's Encrypt/Certbot

### 5. Set Up Backups

Supabase backups:
- Go to Supabase Dashboard > Settings > Backups
- Enable automated daily backups
- Test restore procedure

## Production Configuration

### Database Indexes
Already included in schema, verify:
```sql
-- Check indexes
SELECT * FROM pg_indexes 
WHERE schemaname = 'public';
```

### Storage Policies
Already included, verify:
```sql
-- Check storage policies
SELECT * FROM storage.policies;
```

### RLS Policies
Verify all tables have RLS enabled:
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

## Monitoring & Maintenance

### Weekly Tasks
- Check error logs
- Review slow queries
- Monitor storage usage
- Check subscription status

### Monthly Tasks
- Database backup verification
- Security audit
- Performance review
- User feedback review

## Troubleshooting

### Common Issues

**1. Storage Upload Fails**
- Check bucket exists: 'deliveries'
- Verify RLS policies
- Check file size limits

**2. Authentication Issues**
- Verify email templates configured
- Check redirect URLs
- Review auth.users table

**3. RLS Policy Errors**
- Check user has profile
- Verify organization_id exists
- Review policy definitions

### Support Contacts

- Supabase: support@supabase.io
- Vercel: support@vercel.com

## Security Checklist

- [ ] Environment variables not in source code
- [ ] RLS enabled on all tables
- [ ] Storage bucket has proper policies
- [ ] API keys are secret
- [ ] HTTPS enabled
- [ ] Error messages don't leak sensitive info
- [ ] Rate limiting configured (if needed)
- [ ] CORS properly configured

## Performance Optimization

- [ ] Images optimized
- [ ] Code split
- [ ] Database indexes created
- [ ] Caching configured
- [ ] CDN for static assets

## Compliance

- [ ] Privacy policy added
- [ ] Terms of service added
- [ ] Cookie consent (if needed)
- [ ] GDPR compliance (if EU users)
- [ ] Data retention policy

---

**Deployment Date**: _________
**Deployed By**: _________
**Version**: 1.0.0
**Status**: ✅ Ready for Production

