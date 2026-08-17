import type { FunnelStep } from './funnel';

/**
 * 前端埋點。
 *
 * 刻意做成 fire-and-forget 兼 fail-silent：統計壞咗唔應該阻到客人用工具。
 * 每個步驟每個 session 只計一次 —— 否則客人改一改揀嘅目標就會令
 * goals_selected 谷大幾倍，個漏斗就會出現「後面步驟比前面多」嘅荒謬數字。
 */
const fired = new Set<FunnelStep>();

export function trackStep(step: FunnelStep, opts: { once?: boolean } = { once: true }) {
  if (typeof window === 'undefined') return;
  if (opts.once !== false) {
    if (fired.has(step)) return;
    fired.add(step);
  }
  // keepalive：客人撳完 WhatsApp 即刻離開頁面，請求都要送得出去
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step }),
    keepalive: true,
  }).catch(() => {});
}

/** 重新分析嗰陣清走，令下一次流程可以再計一次。 */
export function resetTracking() {
  fired.clear();
}
