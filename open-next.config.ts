import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * Cloudflare Workers 部署設定。
 *
 * 點解係 Workers 而唔係 Vercel：診所嘅網域 drtimeless.com 本身已經喺
 * Cloudflare 度（帳戶入面有 drtimeless-claim-api worker），所以同一個
 * 供應商、同一個 dashboard、同一張帳單，仲可以直接掛 subdomain，
 * 唔使再搞跨供應商嘅 DNS。
 */
export default defineCloudflareConfig({
  // 冇用 ISR / 快取重新驗證，所以唔使設 incrementalCache。
  // 分析結果本身唔應該快取 —— 每個客人張相都唔同。
});
