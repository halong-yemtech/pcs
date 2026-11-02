/** @type {import('next').NextConfig} */
const nextConfig = {
  // The operations UI is a static single-page app in /public served at "/".
  async rewrites() {
    return [
      { source: '/', destination: '/index.html' },
      // The UI opens stored files at /_blob/<assetId>; the API checks the session and streams the file.
      { source: '/_blob/:id', destination: '/api/assets/:id' },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  serverExternalPackages: ['pg'],
};
export default nextConfig;
