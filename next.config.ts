/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Ceci autorise Vercel à déployer même s'il y a des avertissements ESLint
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;