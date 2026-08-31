import { FINDING_LABELS, GOALS, type FindingKey, type GoalKey } from './treatments/types';

/**
 * 面圖區域層 —— 「喺面圖上點按揀問題」嘅資料基礎。
 *
 * 點解要有呢層：33 項 FindingKey 對客人嚟講係一大串詞彙，但「額頭」「眼周」
 * 「下顎線」係人人一睇就明嘅身體位置。呢層將 33 項觀察掛去 12 個面部區域，
 * 俾 UI 做到：(a) 撳個位 → 淨係列出嗰個位嘅問題；(b) 報告上將 AI 觀察
 * 反過嚟畫返上面圖。
 *
 * ⚠️ 呢個 map 係**多對多**，唔係分割 —— 一項問題可以出現喺幾個區
 *    （例如 jowls 同時屬於法令嘴角、下巴、下顎線），全面性問題
 *    （膚質、缺水）就歸 overall_skin。同 CATEGORIES（categories.ts，
 *    symptom 型分割）係兩層唔同用途嘅嘢，唔好夾硬統一。
 *
 * ⚠️ 33 個 FindingKey 必須每個至少出現一次 —— test-engine 有測試守住。
 */

export type FaceRegionKey =
  | 'forehead'
  | 'glabella'
  | 'temples'
  | 'eyes'
  | 'nose'
  | 'cheeks'
  | 'nasolabial_mouth'
  | 'lips'
  | 'jaw_chin'
  | 'jawline_masseter'
  | 'neck'
  | 'overall_skin';

export const FACE_REGIONS: { key: FaceRegionKey; label: string; findings: FindingKey[] }[] = [
  { key: 'forehead', label: '額頭', findings: ['forehead_lines', 'brow_ptosis', 'acne_active', 'oiliness'] },
  { key: 'glabella', label: '眉心', findings: ['glabellar_lines'] },
  { key: 'temples', label: '太陽穴', findings: ['temple_hollow'] },
  {
    key: 'eyes',
    label: '眼周',
    findings: ['dark_circles', 'eye_bags', 'tear_trough', 'crows_feet', 'upper_eyelid_hooding', 'brow_ptosis'],
  },
  { key: 'nose', label: '鼻', findings: ['bunny_lines', 'pores', 'oiliness', 'redness'] },
  {
    key: 'cheeks',
    label: '面頰',
    findings: [
      'midface_volume_loss',
      'pigmentation',
      'melasma',
      'pih',
      'acne_scar',
      'acne_active',
      'redness',
      'pores',
    ],
  },
  {
    key: 'nasolabial_mouth',
    label: '法令 / 嘴角',
    findings: ['nasolabial_fold', 'marionette_lines', 'perioral_lines', 'jowls'],
  },
  { key: 'lips', label: '嘴唇', findings: ['lip_volume', 'perioral_lines'] },
  { key: 'jaw_chin', label: '下巴', findings: ['chin_retrusion', 'submental_fat', 'jowls'] },
  {
    key: 'jawline_masseter',
    label: '下顎線 / 咬肌',
    findings: ['jawline_definition', 'masseter_hypertrophy', 'jowls', 'skin_laxity'],
  },
  { key: 'neck', label: '頸', findings: ['neck_laxity', 'submental_fat'] },
  {
    key: 'overall_skin',
    label: '整體膚質',
    findings: [
      'texture',
      'dehydration',
      'oiliness',
      'pores',
      'redness',
      'pigmentation',
      'pih',
      'acne_active',
      'skin_laxity',
      'facial_asymmetry',
    ],
  },
];

export const REGION_LABEL: Record<FaceRegionKey, string> = (() => {
  const m = {} as Record<FaceRegionKey, string>;
  for (const r of FACE_REGIONS) m[r.key] = r.label;
  return m;
})();

/** FindingKey → 所屬區域（可以多個），由 FACE_REGIONS 推導，永遠兩邊一致。 */
export const REGIONS_OF_FINDING: Record<FindingKey, FaceRegionKey[]> = (() => {
  const m = {} as Record<FindingKey, FaceRegionKey[]>;
  for (const r of FACE_REGIONS) {
    for (const f of r.findings) {
      (m[f] ??= []).push(r.key);
    }
  }
  return m;
})();

/**
 * 報告顯示用：俾人一眼認到嘅「主區域」——第一個非 overall_skin 嘅區；
 * 全面性問題就照返 overall_skin。
 */
export function primaryRegionOf(f: FindingKey): FaceRegionKey {
  const rs = REGIONS_OF_FINDING[f] ?? [];
  return rs.find((r) => r !== 'overall_skin') ?? rs[0] ?? 'overall_skin';
}

/** GOALS.maps 冇覆蓋嘅 FindingKey → 人手指定最近嘅目標（引擎以 goal 運作，唔可以冇）。 */
const GOAL_FALLBACK: Partial<Record<FindingKey, GoalKey>> = {
  bunny_lines: 'smooth_lines',
};

/**
 * 由客人自選嘅問題反推分析目標（GoalKey）。引擎同 AI prompt 都以 goal
 * 運作，所以面圖揀嘅嘢要轉譯做 goal 先入到現有機器 —— 唔使改引擎。
 */
export function goalsFromFindings(selected: FindingKey[]): GoalKey[] {
  const out: GoalKey[] = [];
  for (const f of selected) {
    for (const g of GOALS) {
      if (g.maps.includes(f) && !out.includes(g.key)) out.push(g.key);
    }
    const fb = GOAL_FALLBACK[f];
    if (fb && !out.includes(fb)) out.push(fb);
  }
  return out;
}

/**
 * 將自選問題寫入俾 AI 嘅 notes。防迎合句一定要跟身 ——
 * prompt.ts 只對 goals 加咗「唔好為咗迎合而屈嘢出嚟」嘅提醒，
 * notes 呢條通道要自己帶埋。
 */
export function buildConcernNotes(selected: FindingKey[]): string | undefined {
  if (selected.length === 0) return undefined;
  const names = selected
    .slice(0, 8)
    .map((f) => FINDING_LABELS[f])
    .join('、');
  return `客人喺面部圖自選關注：${names}。呢啲只係客人主觀感受 —— 如果相中觀察唔到，請照直講，唔好遷就。`;
}

/** test-engine 用：檢查 33 個 FindingKey 全部有區、冇空區、冇未知 key。 */
export function regionCoverageCheck(): { missing: string[]; emptyRegions: string[]; unknownKeys: string[] } {
  const all = Object.keys(FINDING_LABELS) as FindingKey[];
  const covered = new Set<string>();
  const unknownKeys: string[] = [];
  const emptyRegions: string[] = [];
  for (const r of FACE_REGIONS) {
    if (r.findings.length === 0) emptyRegions.push(r.key);
    for (const f of r.findings) {
      if (!all.includes(f)) unknownKeys.push(`${r.key}:${f}`);
      covered.add(f);
    }
  }
  const missing = all.filter((f) => !covered.has(f));
  return { missing, emptyRegions, unknownKeys };
}
