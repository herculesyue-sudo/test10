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
 * ⚠️ 記憶體儲存，重啟即清零，serverless 多 instance 亦唔會加埋一齊。
 *    要長期趨勢就換去資料庫 —— 見 FunnelStore 介面。
 */

export type FunnelStep =
  | 'page_view' // 開咗個頁
  | 'photo_added' // 影咗 / 揀咗相
  | 'goals_selected' // 揀咗最少一個改善目標
  | 'consented' // 剔咗同意
  | 'analyze_started' // 撳咗分析
  | 'analyze_succeeded' // 收到報告
  | 'analyze_failed' // 分析失敗
  | 'booking_clicked'; // 撳咗 WhatsApp 預約

export const FUNNEL_STEPS: FunnelStep[] = [
  'page_view',
  'photo_added',
  'goals_selected',
  'consented',
  'analyze_started',
  'analyze_succeeded',
  'analyze_failed',
  'booking_clicked',
];

export const STEP_LABELS: Record<FunnelStep, string> = {
  page_view: '開啟頁面',
  photo_added: '影咗相',
  goals_selected: '揀咗目標',
  consented: '同意條款',
  analyze_started: '開始分析',
  analyze_succeeded: '收到報告',
  analyze_failed: '分析失敗',
  booking_clicked: '撳預約',
};

export interface FunnelStore {
  bump(day: string, step: FunnelStep): void;
  snapshot(): Record<string, Partial<Record<FunnelStep, number>>>;
}

class MemoryFunnel implements FunnelStore {
  private data = new Map<string, Map<FunnelStep, number>>();
  private readonly keepDays = 30;

  bump(day: string, step: FunnelStep) {
    let d = this.data.get(day);
    if (!d) {
      d = new Map();
      this.data.set(day, d);
      this.trim(day);
    }
    d.set(step, (d.get(step) ?? 0) + 1);
  }

  snapshot() {
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

let store: FunnelStore = new MemoryFunnel();
export function setFunnelStore(s: FunnelStore) {
  store = s;
}

/** 測試用：開一個乾淨嘅記憶體 store，測嘅係真正嘅實作。 */
export function createMemoryFunnel(): FunnelStore {
  return new MemoryFunnel();
}

export function track(step: FunnelStep, day = new Date().toISOString().slice(0, 10)) {
  store.bump(day, step);
}

export function funnelSnapshot() {
  return store.snapshot();
}

/** 由計數算出每一步嘅通過率，直接指出邊一步跌最多人。 */
export function conversionRates(counts: Partial<Record<FunnelStep, number>>) {
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
