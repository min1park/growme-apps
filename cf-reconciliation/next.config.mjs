/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: 'export',
  basePath: '/cf-reconciliation',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
