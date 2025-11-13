/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@mastra/mcp', '@mastra/core']
  }
};

module.exports = nextConfig;
