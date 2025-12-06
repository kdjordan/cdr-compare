/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
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
}

module.exports = nextConfig
