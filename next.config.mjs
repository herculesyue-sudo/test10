/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 相片以 base64 經 API route 傳送，唔存落 server
  experimental: { serverActions: { bodySizeLimit: '12mb' } },
};
export default nextConfig;
