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
 * 私隱設計：份「報告」係經客人自己嘅 WhatsApp 發送 —— 佢喺 WhatsApp
 * 入面睇晒成段訊息先撳發送，冇任何嘢喺背後自動傳俾診所。
 * 摘要刻意精簡（觀察 + 範疇分數 + 療程方向），唔包相片。
 */
export function buildReportBookingUrl(opts: {
  phone: string | undefined;
  goals: GoalKey[];
  findings: { key: string; label: string; severity: number }[];
  categories: { label: string; score: number }[];
  treatments: string[];
  /** 客人稱呼（ContactCard，可選）—— 診所一睇就知係邊個 */
  customerName?: string;
  /** 客人電話（ContactCard，必填）—— 職員可以用嚟喺後台搵紀錄／回電 */
  customerPhone?: string;
  /** 有同意保存評分紀錄先 true —— 話俾職員知後台有嘢睇 */
  recordSaved?: boolean;
}): string | null {
  const phone = opts.phone?.replace(/[^0-9]/g, '');
  if (!phone) return null;

  const goalLabels = opts.goals.map((g) => GOALS.find((x) => x.key === g)?.label).filter(Boolean);
  const sevWord = (s: number) => (s >= 66 ? '明顯' : s >= 41 ? '中度' : '輕微');

  const msg = [
    `你好${opts.customerName ? `，我係${opts.customerName}` : ''}，啱啱完成咗 AI 面部分析，想傳送份報告摘要俾你哋跟進預約。`,
    '',
    '【AI 分析摘要】',
    goalLabels.length ? `想改善：${goalLabels.join('、')}` : null,
    opts.findings.length
      ? `主要觀察：${opts.findings
          .slice(0, 4)
          .map((f) => `${f.label}（${sevWord(f.severity)}）`)
          .join('、')}`
      : null,
    opts.categories.length
      ? `較需關注範疇：${opts.categories
          .slice(0, 3)
          .map((c) => `${c.label} ${c.score}/100`)
          .join('、')}`
      : null,
    opts.treatments.length ? `建議療程方向：${opts.treatments.join('、')}` : null,
    opts.customerPhone ? `我嘅電話：${opts.customerPhone}${opts.recordSaved ? '（已同意保存分析紀錄）' : ''}` : null,
    '',
    '想了解多啲，麻煩你哋跟進。',
  ]
    .filter((x) => x !== null)
    .join('\n');

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}
