/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
  // Body size limit for middleware/route handlers (Next.js 16+)
  middlewareClientMaxBodySize: '500mb',
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
  // Turbopack config for external dependencies
  turbopack: {
    resolveAlias: {
      // Mock optional AWS SDK dependency from unzipper
      '@aws-sdk/client-s3': { browser: '' },
    },
  },
  serverExternalPackages: ['better-sqlite3', 'read-excel-file'],
  webpack: (config, { isServer }) => {
    // Handle native modules and optional dependencies
    if (isServer) {
      config.externals.push('better-sqlite3');
      // Handle unzipper's optional AWS S3 dependency
      config.externals.push('@aws-sdk/client-s3');
    }
    return config;
  },
  // Disable powered-by header
  poweredByHeader: false,
}

module.exports = nextConfig
