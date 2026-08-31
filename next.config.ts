/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 相片以 base64 經 API route 傳送，唔存落 server
  experimental: { serverActions: { bodySizeLimit: '12mb' } },

  /**
   * `npm run tunnel` 之下，個 app 係經一條 *.trycloudflare.com 網址開嘅，
   * 對 Next 嚟講屬跨來源。唔列明就會擋住 dev 嘅資源同 HMR —— 表面症狀
   * 係「打得開但成版嘢冇樣式 / 撳極都冇反應」，好難估到係呢個原因。
   *
   * 只影響 `next dev`，正式 build 冇呢樣嘢。
   */
  allowedDevOrigins: ['*.trycloudflare.com', '*.loca.lt', '*.ngrok-free.app', '192.168.0.0/16'],

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
