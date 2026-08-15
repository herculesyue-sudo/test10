import { CLINIC_TREATMENTS } from './clinic';
import { FINDING_LABELS, GOALS } from './types';
import type { FindingKey, GoalKey, Treatment } from './types';

export * from './types';
export { CLINIC_POLICY, CLINIC_OTHER_SERVICES } from './clinic';

/**
 * 引擎只認診所實際提供嘅療程。
 *
 * `reference/` 入面有 36 個市場通用療程做複製模板，**刻意冇 import** ——
 * 推薦一個診所做唔到嘅療程，等於用自己個工具幫客人搵競爭對手。
 */
export const ALL_TREATMENTS: Treatment[] = CLINIC_TREATMENTS;

export const TREATMENT_BY_ID = new Map(ALL_TREATMENTS.map((t) => [t.id, t]));

/** AI 針對單一特徵嘅評估結果。 */
export interface Finding {
  key: FindingKey;
  /** 嚴重程度 0–100（0 = 完全冇，100 = 極嚴重） */
  severity: number;
  /** 模型對呢個判斷嘅信心 0–1 */
  confidence: number;
  /** 觀察到嘅具體描述（廣東話） */
  observation: string;
  /** 相片上嘅大致位置 */
  location?: string;
}

export interface MatchInput {
  findings: Finding[];
  /** 客人自己揀嘅改善目標 */
  goals: GoalKey[];
  budgetHKD?: number;
  /** 可接受嘅最長停工期（日） */
  maxDowntimeDays?: number;
  /** 避免注射類療程 */
  noInjectables?: boolean;
  isPregnantOrNursing?: boolean;
}

export interface ScoredTreatment {
  treatment: Treatment;
  /** 0–100 綜合配對分 */
  score: number;
  /** 呢個療程針對嘅特徵（已排序） */
  targets: { key: FindingKey; label: string; severity: number; efficacy: number }[];
  /** 為何推薦（規則引擎產生，非 AI 生成） */
  rationale: string;
  /** 因客人條件而觸發嘅警示 */
  flags: string[];
  estCostHKD: { min: number; max: number };
  /** 價錢有冇經診所核實。false 嘅話 UI 要顯示「請洽診所」而唔係報 $0。 */
  priceConfirmed: boolean;
}

/** 低過呢個嚴重程度就當「唔算問題」，唔會觸發推薦。 */
const SEVERITY_FLOOR = 25;
/** 客人主動揀嘅改善目標，相關特徵嘅加權。 */
const GOAL_BOOST = 1.35;
/** 飽和常數：調細 = 分數升得快，調大 = 拉開高分之間嘅差距。 */
const SATURATION_K = 1.2;
/**
 * 低過呢個分數就唔應該當「推薦」顯示。
 * 引擎照計照回傳（方便 debug 同 eval），但 API 只交高過呢條線嘅俾前端 ——
 * 攞住一個 10 分嘅配對去同客人講「建議你做」，係誤導。
 */
export const MIN_PRESENTABLE_SCORE = 20;

/**
 * 將 AI 觀察 + 客人條件配對到療程。
 *
 * 評分 = Σ(嚴重程度 × 療效權重 × 信心) 正規化到 0–100，
 * 再按客人目標、預算、停工期作加權同過濾。
 */
export function matchTreatments(input: MatchInput): ScoredTreatment[] {
  const { findings, goals, budgetHKD, maxDowntimeDays, noInjectables, isPregnantOrNursing } = input;

  // 客人主動揀嘅目標所覆蓋嘅特徵，會有加權
  const goalKeys = new Set<FindingKey>();
  for (const g of goals) {
    const def = GOALS.find((x) => x.key === g);
    def?.maps.forEach((k) => goalKeys.add(k));
  }

  const severityOf = new Map(findings.map((f) => [f.key, f]));

  const scored: ScoredTreatment[] = [];

  for (const t of ALL_TREATMENTS) {
    const targets: ScoredTreatment['targets'] = [];
    let raw = 0;

    for (const ind of t.indications) {
      const f = severityOf.get(ind.key);
      if (!f || f.severity < SEVERITY_FLOOR) continue;

      // 每一項貢獻 0–1.35：嚴重程度 × 療效 × 判斷信心 ×（客人有揀就 ×1.35）
      const goalBoost = goalKeys.has(ind.key) ? GOAL_BOOST : 1;
      raw += (f.severity / 100) * (ind.efficacy / 5) * f.confidence * goalBoost;

      targets.push({ key: ind.key, label: FINDING_LABELS[ind.key], severity: f.severity, efficacy: ind.efficacy });
    }

    if (targets.length === 0) continue;

    targets.sort((a, b) => b.severity * b.efficacy - a.severity * a.efficacy);

    // 用飽和函數而唔係除以「理論最高分」。
    // 除法會令命中越多問題嘅療程分母越大、分數反而越低 —— 同直覺相反。
    // 飽和曲線令「解決多個問題」自然加分，同時分數唔會爆錶。
    const score = 100 * (1 - Math.exp(-raw / SATURATION_K));

    const flags: string[] = [];

    if (isPregnantOrNursing) {
      const pregWarn = t.contraindications.some((c) => c.includes('懷孕'));
      if (pregWarn) flags.push('⚠️ 懷孕 / 哺乳期不建議');
    }
    if (maxDowntimeDays != null && t.downtimeDays[1] > maxDowntimeDays) {
      flags.push(`⏱ 停工期最長 ${t.downtimeDays[1]} 日，超出你設定嘅 ${maxDowntimeDays} 日`);
    }
    if (t.risk === 'high') flags.push('🔴 屬高風險程序，務必揀有經驗嘅註冊醫生');

    const est = estimateCost(t);
    // 未核實價錢就唔會觸發預算警示 —— 攞 $0 去同預算比較毫無意義
    if (budgetHKD != null && isPriceConfirmed(t) && est.min > budgetHKD) {
      flags.push(`💰 估算最低 HK$${est.min.toLocaleString()} 已超出預算`);
    }

    scored.push({
      treatment: t,
      score: Math.round(score),
      targets,
      rationale: buildRationale(t, targets, goalKeys),
      flags,
      estCostHKD: est,
      priceConfirmed: isPriceConfirmed(t),
    });
  }

  let out = scored;
  if (noInjectables) out = out.filter((s) => s.treatment.category !== 'injectable');
  if (isPregnantOrNursing) {
    out = out.filter((s) => !s.treatment.contraindications.some((c) => c.includes('懷孕')));
  }

  return out.sort((a, b) => b.score - a.score);
}

/** 預設 'tbc'：報一個未核實嘅價，好過報一個錯價。 */
export function isPriceConfirmed(t: Treatment): boolean {
  return t.priceStatus === 'confirmed' && t.priceHKD.max > 0;
}

function estimateCost(t: Treatment): { min: number; max: number } {
  if (!isPriceConfirmed(t)) return { min: 0, max: 0 };
  // 由 sessions 字串抽出建議次數，估算整個療程成本
  const m = t.sessions.match(/(\d+)\s*[–\-~]?\s*(\d+)?/);
  const lo = m ? parseInt(m[1], 10) : 1;
  const hi = m && m[2] ? parseInt(m[2], 10) : lo;
  return { min: t.priceHKD.min * lo, max: t.priceHKD.max * hi };
}

function buildRationale(t: Treatment, targets: ScoredTreatment['targets'], goalKeys: Set<FindingKey>): string {
  const primary = targets.slice(0, 3);
  const names = primary.map((x) => x.label).join('、');
  const wanted = primary.filter((x) => goalKeys.has(x.key)).map((x) => x.label);
  let s = `針對你嘅${names}。${t.mechanism}`;
  if (wanted.length) s += ` 呢個直接對應你揀咗嘅改善目標（${wanted.join('、')}）。`;
  return s;
}

/**
 * 將已排序嘅療程組成分階段方案：
 * 第一階段做基礎（膚質/發炎），第二階段做結構（緊緻/容積），第三階段維持。
 */
export interface PlanPhase {
  phase: number;
  title: string;
  timing: string;
  items: ScoredTreatment[];
  subtotalHKD: { min: number; max: number };
  /** 呢個階段有冇未核實價錢嘅療程 —— 有嘅話小計係低估咗 */
  hasUnpricedItems: boolean;
}

const FOUNDATION: FindingKey[] = [
  'acne_active',
  'redness',
  'oiliness',
  'dehydration',
  'texture',
  'pih',
  'melasma',
  'pigmentation',
  'pores',
];

export function buildPhasedPlan(scored: ScoredTreatment[], limit = 8): PlanPhase[] {
  const top = scored.filter((s) => s.score >= 20).slice(0, limit);

  const isFoundation = (s: ScoredTreatment) => FOUNDATION.includes(s.targets[0]?.key);

  const p1 = top.filter(isFoundation).slice(0, 3);
  const p2 = top.filter((s) => !isFoundation(s) && s.treatment.category !== 'injectable').slice(0, 3);
  const p3 = top.filter((s) => !isFoundation(s) && s.treatment.category === 'injectable').slice(0, 3);

  const phases: PlanPhase[] = [
    { phase: 1, title: '打底：先處理發炎、色素同膚質', timing: '第 0–8 星期', items: p1, ...totals(p1) },
    { phase: 2, title: '結構：緊緻提升（非注射）', timing: '第 6–16 星期', items: p2, ...totals(p2) },
    { phase: 3, title: '塑形：容積補充同輪廓（注射）', timing: '第 12 星期起', items: p3, ...totals(p3) },
  ];

  return phases.filter((p) => p.items.length > 0);
}

function totals(items: ScoredTreatment[]) {
  return {
    subtotalHKD: items.reduce(
      (acc, i) => ({ min: acc.min + i.estCostHKD.min, max: acc.max + i.estCostHKD.max }),
      { min: 0, max: 0 },
    ),
    hasUnpricedItems: items.some((i) => !i.priceConfirmed),
  };
}
