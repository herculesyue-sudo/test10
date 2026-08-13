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
