/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost', 'gllswthsxocdrbrvppep.supabase.co'],
  },
  // IMPORTANT: we want a Node.js server, NOT static export
  output: 'standalone', // For Docker / Vercel Node deployment
};

module.exports = nextConfig;
