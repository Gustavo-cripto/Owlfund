/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ["**/desktop/**", "**/mobile/**"],
    };
    return config;
  },
};

module.exports = nextConfig;
