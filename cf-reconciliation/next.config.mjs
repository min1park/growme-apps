/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/cf-reconciliation',
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    // exFAT 드라이브 호환성: symlink 해석 비활성화
    config.resolve.symlinks = false;
    return config;
  },
};

export default nextConfig;
