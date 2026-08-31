import { FINDING_LABELS, type FindingKey } from './treatments/types';

/**
 * 8 大範疇評分 —— 將 33 項觀察歸納做客人一眼睇得明嘅 8 個分數。
 *
 * 點解要有呢層：33 項特徵對醫生嚟講係精細，對客人嚟講係噪音。
 * 客人want嘅係「我皮膚邊方面好、邊方面差」—— 一個雷達圖答到嘅問題。
 * 呢層係**純顯示歸納**：分數由 findings 即場計出嚟，唔另外問 AI，
 * 所以唔會同詳細觀察自相矛盾。
 *
 * ⚠️ 呢個 map 必須係 33 個 FindingKey 嘅完整分割（每個 key 恰好一次）。
 *    test-engine 有測試守住 —— 加新 FindingKey 而唔加入呢度會 fail。
 *
 * ⚠️ 唔好將呢度同 FOUNDATION（treatments/index.ts，分階段用）或者
 *    SURFACE_KEYS（postprocess.ts，化妝壓信心用）混為一談 —— 三個
 *    分組服務三個唔同目的，夾硬統一只會令三個都做得差。
 */

export type CategoryKey =
  | 'pigment'
  | 'acne_oil'
  | 'texture_hydration'
  | 'redness_sensitivity'
  | 'wrinkles'
  | 'firmness_contour'
  | 'volume'
  | 'eye_area';

export const CATEGORIES: { key: CategoryKey; label: string; findings: FindingKey[] }[] = [
  { key: 'pigment', label: '色斑色素', findings: ['pigmentation', 'melasma', 'pih'] },
  { key: 'acne_oil', label: '暗瘡油脂', findings: ['acne_active', 'acne_scar', 'pores', 'oiliness'] },
  { key: 'texture_hydration', label: '膚質水潤', findings: ['texture', 'dehydration'] },
  { key: 'redness_sensitivity', label: '泛紅敏感', findings: ['redness'] },
  {
    key: 'wrinkles',
    label: '皺紋',
    findings: ['forehead_lines', 'glabellar_lines', 'crows_feet', 'bunny_lines', 'perioral_lines'],
  },
  {
    key: 'firmness_contour',
    label: '緊緻輪廓',
    findings: [
      'skin_laxity',
      'brow_ptosis',
      'jowls',
      'jawline_definition',
      'masseter_hypertrophy',
      'submental_fat',
      'neck_laxity',
      'facial_asymmetry',
    ],
  },
  {
    key: 'volume',
    label: '面部飽滿',
    findings: [
      'temple_hollow',
      'midface_volume_loss',
      'nasolabial_fold',
      'marionette_lines',
      'chin_retrusion',
      'lip_volume',
    ],
  },
  // 淚溝同上眼皮鬆弛擺喺眼周而唔係容積/鬆弛：客人係當「眼部問題」咁理解
  { key: 'eye_area', label: '眼周', findings: ['dark_circles', 'eye_bags', 'tear_trough', 'upper_eyelid_hooding'] },
];

/** FindingKey → 所屬範疇，由 CATEGORIES 推導，永遠唔會兩邊唔一致。 */
export const CATEGORY_OF: Record<FindingKey, CategoryKey> = (() => {
  const m = {} as Record<FindingKey, CategoryKey>;
  for (const c of CATEGORIES) for (const f of c.findings) m[f] = c.key;
  return m;
})();

export interface CategoryScore {
  key: CategoryKey;
  label: string;
  /** 0–100 整數，越高代表相中狀況越好 */
  score: number;
  band: 'clear' | 'good' | 'improvable' | 'attention';
  bandLabel: string;
  /** 貢獻呢個分數嘅觀察，平均信心 < 0.5 —— 相片因素，參考價值有限 */
  lowConfidence: boolean;
  findingCount: number;
}

/**
 * 分數帶。字眼刻意溫和（合規：唔可以有絕對化聲稱），
 * 「建議關注」而唔係「嚴重」—— 呢個係相片估算，唔係診斷。
 */
export function bandOf(score: number, findingCount: number): { band: CategoryScore['band']; bandLabel: string } {
  if (findingCount === 0) return { band: 'clear', bandLabel: '冇明顯問題' };
  if (score >= 85) return { band: 'good', bandLabel: '良好' };
  if (score >= 60) return { band: 'improvable', bandLabel: '可改善' };
  return { band: 'attention', bandLabel: '建議關注' };
}

/**
 * 計 8 個範疇分數。永遠回傳 8 項、次序固定（雷達圖要穩定軸）。
 *
 * 每個範疇：score = 100 − round(Σ(severity×confidence) / Σconfidence)
 * —— 即係「信心加權平均嚴重度」嘅倒數。低信心嘅觀察拉分數嘅力細啲，
 * 同時成個範疇會標 lowConfidence，兩層誠實：分數同「呢個分數信唔信得過」
 * 分開講，呼應成個系統 severity/confidence 分離嘅原則。
 *
 * 冇任何觀察 → 100 分「冇明顯問題」。輸入 key 唔認得就跳過（API 回應
 * 嗰邊 key 係 string type，唔可以假設一定合法）。
 */
export function computeCategoryScores(
  findings: { key: string; severity: number; confidence: number }[],
): CategoryScore[] {
  const byCat = new Map<CategoryKey, { sev: number; conf: number }[]>();
  for (const f of findings) {
    const cat = CATEGORY_OF[f.key as FindingKey];
    if (!cat) continue; // 未知 key：唔好炸，亦唔好亂入賬
    const arr = byCat.get(cat) ?? [];
    arr.push({ sev: f.severity, conf: f.confidence });
    byCat.set(cat, arr);
  }

  return CATEGORIES.map((c) => {
    const items = byCat.get(c.key) ?? [];
    let score = 100;
    let lowConfidence = false;
    if (items.length > 0) {
      const confSum = items.reduce((s, x) => s + x.conf, 0);
      // postProcess 已經丟走信心 <0.2 嘅項，confSum 理論上唔會係 0，
      // 但純函數唔可以靠外部保證 —— 0 就退去無加權平均
      const weighted =
        confSum > 0
          ? items.reduce((s, x) => s + x.sev * x.conf, 0) / confSum
          : items.reduce((s, x) => s + x.sev, 0) / items.length;
      score = Math.min(100, Math.max(0, 100 - Math.round(weighted)));
      lowConfidence = confSum / items.length < 0.5;
    }
    const { band, bandLabel } = bandOf(score, items.length);
    return { key: c.key, label: c.label, score, band, bandLabel, lowConfidence, findingCount: items.length };
  });
}

/** 俾測試用：確認 map 係完整分割。 */
export function partitionCheck(): { total: number; missing: string[]; duplicated: string[] } {
  const all = Object.keys(FINDING_LABELS);
  const seen = new Map<string, number>();
  for (const c of CATEGORIES) for (const f of c.findings) seen.set(f, (seen.get(f) ?? 0) + 1);
  return {
    total: all.length,
    missing: all.filter((k) => !seen.has(k)),
    duplicated: [...seen].filter(([, n]) => n > 1).map(([k]) => k),
  };
}
