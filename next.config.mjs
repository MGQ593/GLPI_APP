/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Configuración para producción
  poweredByHeader: false,
  compress: true,
};

export default nextConfig;
