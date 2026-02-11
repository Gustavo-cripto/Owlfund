/** @type {import('next').NextConfig} */
const nextConfig = {
  // Avoid incorrect workspace root inference when multiple lockfiles exist
  // (e.g. in /mobile or /desktop). This fixes builds on Vercel too.
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
