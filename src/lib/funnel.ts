/**
 * 轉化漏斗統計。
 *
 * MVP 嘅整個目的係驗證「客人肯唔肯影相，同肯唔肯㩒預約」。冇呢個數字，
 * 你只會知道有人用過，但唔知係邊一步跌人 —— 而每一步嘅解決方法完全唔同：
 *
 *   到咗但冇影相    → 文案 / 信任問題（同意條款嚇親人？）
 *   影咗相但冇分析  → 揀目標嗰步太煩
 *   睇咗報告冇預約  → 報告本身唔夠說服力，或者 CTA 唔夠明顯
 *
 * 刻意唔用 GA / Plausible：唔想為咗睇四個數字而引入第三方 cookie，
 * 亦唔想再多一份私隱聲明要寫。呢度只記事件計數，冇 cookie、冇 IP、
 * 冇任何可以識別到個人嘅嘢。
 *
 * ⚠️ 儲存：有 VISITS_DB binding 就用 D1（funnel-d1.ts，跨 isolate
 *    準確、重啟唔會清零）；冇 binding 先落記憶體（本機 dev / demo）。
 *    記憶體版嘅數字喺 Workers 上冇決策價值 —— 正式環境冇 D1 嘅話，
 *    修好 D1 先好睇漏斗。
 */

export type FunnelStep =
  | 'page_view' // 開咗個頁
  | 'photo_added' // 影咗 / 揀咗相
  | 'goals_selected' // 揀咗最少一個改善目標
  | 'consented' // 剔咗同意
  | 'analyze_started' // 撳咗分析
  | 'analyze_succeeded' // 收到報告
  | 'analyze_failed' // 分析失敗
  | 'camera_fallback' // 頁面內相機開唔到，退咗去揀相
  | 'booking_clicked' // 撳咗 WhatsApp 查詢
  | 'report_saved'; // 客人自願留電話保存報告（結果頁嘅自願流程）

export const FUNNEL_STEPS: FunnelStep[] = [
  'page_view',
  'photo_added',
  'goals_selected',
  'consented',
  'analyze_started',
  'analyze_succeeded',
  'analyze_failed',
  'camera_fallback',
  'booking_clicked',
  'report_saved',
];

export const STEP_LABELS: Record<FunnelStep, string> = {
  page_view: '開啟頁面',
  photo_added: '影咗相',
  goals_selected: '揀咗目標',
  consented: '同意條款',
  analyze_started: '開始分析',
  analyze_succeeded: '收到報告',
  analyze_failed: '分析失敗',
  camera_fallback: '相機開唔到，退回揀相',
  booking_clicked: '撳查詢',
  report_saved: '自願保存報告',
};

export interface FunnelStore {
  bump(day: string, step: FunnelStep): Promise<void>;
  snapshot(): Promise<Record<string, Partial<Record<FunnelStep, number>>>>;
}

class MemoryFunnel implements FunnelStore {
  private data = new Map<string, Map<FunnelStep, number>>();
  private readonly keepDays = 30;

  async bump(day: string, step: FunnelStep) {
    let d = this.data.get(day);
    if (!d) {
      d = new Map();
      this.data.set(day, d);
      this.trim(day);
    }
    d.set(step, (d.get(step) ?? 0) + 1);
  }

  async snapshot() {
    const out: Record<string, Partial<Record<FunnelStep, number>>> = {};
    for (const [day, steps] of [...this.data].sort((a, b) => b[0].localeCompare(a[0]))) {
      out[day] = Object.fromEntries(steps);
    }
    return out;
  }

  private trim(justAdded?: string) {
    if (this.data.size <= this.keepDays) return;
    // 唔可以刮走啱啱加嗰日 —— 否則補寫舊日期時會即刻刪返自己
    const oldest = [...this.data.keys()].sort().find((k) => k !== justAdded);
    if (oldest) this.data.delete(oldest);
  }
}

let injected: FunnelStore | null = null;
/** 測試或者換其他後端用。 */
export function setFunnelStore(s: FunnelStore) {
  injected = s;
  resolved = s;
}

/** 測試用：開一個乾淨嘅記憶體 store，測嘅係真正嘅實作。 */
export function createMemoryFunnel(): FunnelStore {
  return new MemoryFunnel();
}

let resolved: FunnelStore | null = null;
const memorySingleton = new MemoryFunnel();

/**
 * 攞 store：注入 > D1（有 VISITS_DB binding 先有）> 記憶體單例。
 * 同 visits.ts 一樣用動態 import 載入 D1 版：@opennextjs/cloudflare
 * 係 ESM-only，test-engine（tsx CJS）同瀏覽器 bundle 都唔可以掂到佢。
 *
 * ⚠️ 記憶體 fallback 喺 Workers 每個 isolate 各自計數、重啟清零 ——
 *    嗰個狀態下嘅 funnel 數字冇決策價值，正式環境一定要有 D1。
 */
async function getStore(): Promise<FunnelStore> {
  if (injected) return injected;
  if (resolved) return resolved;
  let store: FunnelStore;
  try {
    const mod = await import('./funnel-d1');
    store = mod.tryCreateD1Funnel() ?? memorySingleton;
  } catch {
    store = memorySingleton;
  }
  resolved = store;
  return store;
}

export async function track(step: FunnelStep, day = new Date().toISOString().slice(0, 10)) {
  const s = await getStore();
  await s.bump(day, step);
}

export async function funnelSnapshot() {
  const s = await getStore();
  return s.snapshot();
}

/** 由計數算出每一步嘅通過率，直接指出邊一步跌最多人。 */
export function conversionRates(counts: Partial<Record<FunnelStep, number>>) {
  // 側事件（analyze_failed、camera_fallback）唔入呢條鏈 —— 佢哋唔係
  // 「上一步嘅人去咗邊」，而係徵狀計數，喺 total/byDay 度睇。
  const chain: FunnelStep[] = [
    'page_view',
    'photo_added',
    'goals_selected',
    'consented',
    'analyze_started',
    'analyze_succeeded',
    'booking_clicked',
  ];
  const rows: { step: FunnelStep; label: string; count: number; fromPrev: number | null; fromTop: number | null }[] = [];
  const top = counts.page_view ?? 0;
  let prev: number | null = null;

  for (const s of chain) {
    const c = counts[s] ?? 0;
    rows.push({
      step: s,
      label: STEP_LABELS[s],
      count: c,
      fromPrev: prev && prev > 0 ? c / prev : null,
      fromTop: top > 0 ? c / top : null,
    });
    prev = c;
  }
  return rows;
}
