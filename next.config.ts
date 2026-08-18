/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 相片以 base64 經 API route 傳送，唔存落 server
  experimental: { serverActions: { bodySizeLimit: '12mb' } },

  async headers() {
    // ⚠️ 呢度只擺**同環境變數無關**嘅 header。
    //
    // headers() 喺 build 嗰陣 evaluate，個值會烘死落 routes-manifest。任何
    // 讀 process.env 嘅 header 擺喺呢度，都會出現「改咗環境變數但冇重新
    // 部署 → 靜靜雞唔生效」。frame-ancestors 要讀 env，所以喺 middleware.ts。
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};
export default nextConfig;
