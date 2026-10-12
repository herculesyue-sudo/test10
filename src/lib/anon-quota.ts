/**
 * 匿名客人嘅每日額度。
 *
 * 2026-10 流程改版之後，基本分析**唔使再留電話**（電話搬咗去結果頁做
 * 自願保存／跟進）。冇咗「每電話 3 次」呢道閘，就要有一道匿名閘補位，
 * 否則一個人可以無限 refresh 燒你嘅 Vertex 額度。
 *
 * 匿名額度嘅設計取捨：
 * - 用 IP 做 key。會誤傷共享 IP（商廈 NAT、4G 基站出口），所以個數
 *   要鬆過「每電話 3 次」少少，同埋被擋嗰陣嘅文案一定要指向 WhatsApp
 *   —— 擋人都要擋得有轉化。
 * - **記憶體實作**，Workers 每個 isolate 各自計數，重啟清零。呢個係
 *   刻意嘅：匿名額度係「減少濫用」而唔係「精準計費」。真正嘅硬上限係
 *   D1 入面嘅月度預算（ai-budget.ts）——嗰層先係「最壞情況蝕幾多」。
 *   要更硬就開 Turnstile（代碼已內置，TURNSTILE_SECRET_KEY 一設即用）。
 * - IP 經 HMAC（FUNNEL_TOKEN 做 pepper）先落記憶體 —— 同 phone-quota
 *   同一原則：計數唔需要見到原文。
 */

import { createHmac } from 'node:crypto';

/** 匿名（冇留電話）每個 IP 每日嘅免費分析次數。 */
export const ANON_DAILY_PER_IP = Number(process.env.ANON_DAILY_PER_IP ?? 3);

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function anonKey(ip: string): string {
  const pepper = process.env.FUNNEL_TOKEN || 'dev-pepper-not-secret';
  // 撈埋日期落 hash：過咗日個 key 自然唔同，舊紀錄自動失效，
  // 唔使寫 TTL 清理邏輯。
  return createHmac('sha256', pepper).update(`anon:${dayKey()}:${ip}`).digest('hex');
}

// globalThis 單例：原因同 pending-reports.ts —— `next dev` 每個 route
// 有獨立 module graph，普通 module-level Map 跨唔到 route。
function countsMap(): Map<string, number> {
  const g = globalThis as { __drtAnonQuota?: Map<string, number> };
  if (!g.__drtAnonQuota) g.__drtAnonQuota = new Map();
  return g.__drtAnonQuota;
}

/** 用咗幾多次（今日）。 */
export function anonUsed(ip: string): number {
  const counts = countsMap();
  // 懶清理：map 大過一個合理水位就全清 —— key 本身帶日期，
  // 清走舊 key 唔影響今日嘅計數。
  if (counts.size > 5000) counts.clear();
  return counts.get(anonKey(ip)) ?? 0;
}

/** 記一次，回傳新嘅已用次數。 */
export function anonIncrement(ip: string): number {
  const counts = countsMap();
  const k = anonKey(ip);
  const n = (counts.get(k) ?? 0) + 1;
  counts.set(k, n);
  return n;
}

/** 測試用：清零。 */
export function _resetAnonQuota() {
  countsMap().clear();
}
