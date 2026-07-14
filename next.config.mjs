/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable the built-in body parser so formidable can handle multipart uploads
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'playwright', 'pdf-parse', 'mammoth', 'pdf-lib'],
  },
};

export default nextConfig;
