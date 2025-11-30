/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost', 'gllswthsxocdrbrvppep.supabase.co'],
  },
  output: 'standalone', // For Docker deployment
}

module.exports = nextConfig
