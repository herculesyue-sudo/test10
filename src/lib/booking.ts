import { GOALS, type GoalKey } from './treatments/types';

/**
 * 產生預填 WhatsApp 預約訊息。
 *
 * 客人唔使自己諗點開口，診所收到訊息就已經知道佢想改善咩、
 * 睇過邊幾個建議 —— 對話由「你好」變成有 context 嘅查詢。
 *
 * 抽咗出嚟做獨立模組係因為 encode 出錯會令 wa.me 連結靜靜咁失效
 * （唔會報錯，只係訊息變空白），而呢個係整條 MVP 轉化鏈嘅單點故障。
 */
export function buildBookingUrl(opts: {
  phone: string | undefined;
  goals: GoalKey[];
  treatments: string[];
}): string | null {
  const phone = opts.phone?.replace(/[^0-9]/g, '');
  if (!phone) return null;

  const goalLabels = opts.goals.map((g) => GOALS.find((x) => x.key === g)?.label).filter(Boolean);

  const msg = [
    '你好，我啱啱做咗網上 AI 面部分析，想預約諮詢。',
    goalLabels.length ? `我想改善：${goalLabels.join('、')}` : null,
    opts.treatments.length ? `系統建議嘅療程方向：${opts.treatments.join('、')}` : null,
    '請問幾時方便？',
  ]
    .filter(Boolean)
    .join('\n');

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

/**
 * 「傳送報告俾 Dr Timeless 預約」—— 預填埋一段報告摘要。
 *
 * 私隱設計（2026-10 收緊）：
 * - 份「報告」係經客人自己嘅 WhatsApp 發送 —— 佢喺 WhatsApp 入面
 *   睇晒成段訊息先撳發送，冇任何嘢喺背後自動傳俾診所。
 * - **唔再自動放入客人電話、稱呼、年齡或懷孕資料**。分享乜係客人
 *   自己嘅決定，佢喺 WhatsApp 入面可以改完先 send。
 * - 摘要刻意精簡（目標＋主要觀察＋療程方向），唔包完整報告、唔包相片。
 */
export function buildReportBookingUrl(opts: {
  phone: string | undefined;
  goals: GoalKey[];
  findings: { key: string; label: string; severity: number }[];
  categories: { label: string; score: number }[];
  treatments: string[];
}): string | null {
  const phone = opts.phone?.replace(/[^0-9]/g, '');
  if (!phone) return null;

  const goalLabels = opts.goals.map((g) => GOALS.find((x) => x.key === g)?.label).filter(Boolean);
  const sevWord = (s: number) => (s >= 66 ? '明顯' : s >= 41 ? '中度' : '輕微');

  const msg = [
    '你好，我啱啱做咗網上 AI 面部分析，想了解適合我嘅護理方向。',
    goalLabels.length ? `我想改善：${goalLabels.join('、')}` : null,
    opts.findings.length
      ? `相片主要觀察：${opts.findings
          .slice(0, 2)
          .map((f) => `${f.label}（${sevWord(f.severity)}）`)
          .join('、')}`
      : null,
    opts.treatments.length ? `建議方向：${opts.treatments.join('、')}` : null,
    '想請問下一步可以點安排？',
  ]
    .filter((x) => x !== null)
    .join('\n');

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

/**
 * 醫生面診入口（醫療服務）—— 同一般美容查詢分開。
 *
 * 預填刻意更短：乜分析內容都唔帶。醫療查詢應該由客人自己講，
 * 唔係由系統代佢講。收費資料唔寫死喺度 —— 未核實嘅價錢唔可以出街，
 * 呢條訊息只係問「安排同收費」。
 */
export function buildDoctorBookingUrl(phone: string | undefined): string | null {
  const p = phone?.replace(/[^0-9]/g, '');
  if (!p) return null;
  const msg = '你好，我啱啱做咗網上 AI 面部分析，想了解醫生面診嘅安排同收費。';
  return `https://wa.me/${p}?text=${encodeURIComponent(msg)}`;
}

/**
 * 免費到店皮膚檢測入口（已同診所核實 2026-10：免費、皮膚分析儀檢測、
 * 由診所團隊進行、**非醫生檢查**）。
 *
 * 定位係「比自拍準一步」嘅中間層：自拍 → AI 報告 → 到店儀器 →
 * 有需要先醫生面診。預填唔帶任何分析內容 —— 到店會重新檢測，
 * 帶舊數據反而誤導。
 */
export function buildSkinCheckUrl(phone: string | undefined): string | null {
  const p = phone?.replace(/[^0-9]/g, '');
  if (!p) return null;
  const msg = '你好，我啱啱做咗網上 AI 面部分析，想預約免費到店皮膚檢測。';
  return `https://wa.me/${p}?text=${encodeURIComponent(msg)}`;
}
