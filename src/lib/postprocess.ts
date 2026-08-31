import type { Analysis, AnalysisFinding } from './schema';
import type { FindingKey } from './treatments/types';
import { sanitizeLandmarks } from './face-align';

/**
 * ══════════════════════════════════════════════════════════════════
 *  分析結果嘅確定性後處理
 * ══════════════════════════════════════════════════════════════════
 *
 * 核心原則：**prompt 係請求，code 先係保證。**
 *
 * `prompt.ts` 已經寫明「化咗妝就將膚質相關 confidence 壓到 0.45 以下」、
 * 「唔好夾硬砌夠數」。但 prompt 只係求個模型咁做 —— 佢有時會唔跟，而
 * 我哋唔會知，因為輸出照樣通過 schema 驗證，睇落一切正常。
 *
 * 呢個檔將 prompt 入面每一條**影響安全或成本**嘅規則，喺 code 度再執行
 * 一次。模型跟足嘅時候呢度乜都唔會做；模型冇跟嘅時候呢度就係唯一防線。
 *
 * 每一條規則都會記低喺 `adjustments`，唔會靜靜雞改咗個結果 —— 靜靜雞
 * 修正比唔修正更差，因為冇人會發現個模型開始失準。
 */

/**
 * 化妝／光線會遮蓋嘅特徵。
 *
 * 只包括睇**皮膚表面**嘅項目。結構性特徵（嘴邊肉、下巴後縮、咬肌）
 * 唔會俾粉底遮到，唔應該一齊壓低信心 —— 過度保守會令真正睇得準嘅
 * 判斷都被丟棄。
 */
const SURFACE_KEYS: ReadonlySet<FindingKey> = new Set<FindingKey>([
  'pigmentation',
  'melasma',
  'pih',
  'redness',
  'acne_active',
  'acne_scar',
  'pores',
  'oiliness',
  'texture',
  'dehydration',
  'dark_circles',
]);

/** 化妝之下，膚質判斷嘅信心上限。同 prompt.ts 寫俾模型嗰個數一致。 */
const MAKEUP_CONFIDENCE_CAP = 0.45;
/** 光線差之下嘅信心上限。 */
const POOR_LIGHT_CONFIDENCE_CAP = 0.5;

/**
 * 信心低過呢個數就當睇唔到。
 *
 * 0.2 以下即係模型自己都話「我唔肯定有冇」。呢啲項目入到配對引擎會攤薄
 * 分數，令真正嘅問題排後咗；出到報告就變成「乜都有啲問題」，客人反而
 * 唔知應該處理邊樣。
 */
const MIN_CONFIDENCE = 0.2;

export interface Adjustment {
  rule: string;
  detail: string;
}

export interface PostProcessResult {
  analysis: Analysis;
  adjustments: Adjustment[];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** 排序權重：嚴重程度 × 信心。低信心嘅嚴重問題唔應該排喺高信心嘅中度問題前面。 */
const weight = (f: AnalysisFinding) => f.severity * f.confidence;

export function postProcess(a: Analysis): PostProcessResult {
  const adjustments: Adjustment[] = [];
  const q = a.imageQuality;

  // ── 0. 面部定位點消毒 ──
  // schema 刻意冇落座標範圍（parse 失敗會炸成份報告），所以喺呢度
  // 剷走壞定位點／自動交換左右眼；壞咗淨係冇「真相版觀察圖」，報告照出。
  const lmResult = sanitizeLandmarks(a.landmarks);
  if (lmResult.rule) {
    adjustments.push({
      rule: lmResult.rule,
      detail: lmResult.landmarks
        ? '模型用咗解剖學左右，已自動交換兩眼'
        : '面部定位點唔合格已剷走，報告會用示意圖',
    });
  }
  a = { ...a, landmarks: lmResult.landmarks };

  // ── 1. 同一個 key 出現多過一次 ──
  // schema 攔唔到重複。唔處理嘅話，配對引擎會將同一個問題計兩次，
  // 令嗰個療程分數不合理咁高。
  const byKey = new Map<string, AnalysisFinding>();
  for (const f of a.findings) {
    const prev = byKey.get(f.key);
    if (!prev) {
      byKey.set(f.key, f);
      continue;
    }
    adjustments.push({ rule: 'dedupe', detail: `${f.key} 出現多過一次，保留權重較高嗰項` });
    if (weight(f) > weight(prev)) byKey.set(f.key, f);
  }

  let findings = [...byKey.values()].map((f) => {
    let confidence = clamp(f.confidence, 0, 1);
    const severity = clamp(Math.round(f.severity), 0, 100);

    // ── 2. 化妝：壓低膚質相關信心 ──
    if (q.makeupDetected && SURFACE_KEYS.has(f.key as FindingKey) && confidence > MAKEUP_CONFIDENCE_CAP) {
      adjustments.push({
        rule: 'makeup-cap',
        detail: `${f.key} 信心由 ${f.confidence.toFixed(2)} 壓到 ${MAKEUP_CONFIDENCE_CAP}（偵測到化妝）`,
      });
      confidence = MAKEUP_CONFIDENCE_CAP;
    }

    // ── 3. 光線差：同樣壓低 ──
    if (q.lighting === 'poor' && SURFACE_KEYS.has(f.key as FindingKey) && confidence > POOR_LIGHT_CONFIDENCE_CAP) {
      adjustments.push({
        rule: 'poor-light-cap',
        detail: `${f.key} 信心壓到 ${POOR_LIGHT_CONFIDENCE_CAP}（光線差）`,
      });
      confidence = POOR_LIGHT_CONFIDENCE_CAP;
    }

    return { ...f, severity, confidence };
  });

  // ── 4. 丟走信心過低同 severity 為 0 嘅項目 ──
  const before = findings.length;
  findings = findings.filter((f) => f.confidence >= MIN_CONFIDENCE && f.severity > 0);
  if (findings.length < before) {
    adjustments.push({
      rule: 'low-confidence-drop',
      detail: `丟走 ${before - findings.length} 項信心低過 ${MIN_CONFIDENCE} 或 severity 為 0 嘅觀察`,
    });
  }

  findings.sort((x, y) => weight(y) - weight(x));

  return {
    analysis: {
      ...a,
      findings,
      // redFlags 永遠唔會被過濾。呢個係整個系統入面代價最高嘅錯誤 ——
      // 漏咗一粒可疑嘅痣，比推薦錯療程嚴重好多個量級。
      redFlags: a.redFlags,
    },
    adjustments,
  };
}

/**
 * 相片唔可用嘅時候應該點。
 *
 * 之前 `imageQuality.usable` 係計咗出嚟但冇人理 —— 模型可以話「呢張相
 * 睇唔到嘢」，然後系統照樣出一份睇落好肯定嘅報告。垃圾入、精美垃圾出，
 * 而客人冇任何線索知道唔可信。
 *
 * 呢度定義咗「唔可用」嘅實際門檻：模型明講唔可用，或者根本觀察唔到
 * 任何嘢（大機會唔係一張正常人面）。
 */
export function usabilityVerdict(a: Analysis): { ok: boolean; reason?: string; retakeHints: string[] } {
  const q = a.imageQuality;
  const hints: string[] = [];

  if (q.lighting === 'poor') hints.push('搵個光少少嘅位，最好用自然光，唔好背光');
  if (q.makeupDetected) hints.push('素顏重影會準確好多 —— 粉底會遮住色斑同泛紅');
  for (const i of q.issues) hints.push(i);
  if (hints.length === 0) hints.push('對正鏡頭、唔好笑、除低眼鏡，影清楚啲');

  if (!q.usable) {
    return { ok: false, reason: '呢張相唔夠清晰，分析結果會唔準。', retakeHints: hints };
  }
  if (a.findings.length === 0 && a.redFlags.length === 0) {
    return {
      ok: false,
      reason: '喺呢張相入面觀察唔到可以評估嘅面部特徵。',
      retakeHints: ['確認相入面有清晰嘅正面人臉', ...hints],
    };
  }
  return { ok: true, retakeHints: hints };
}
