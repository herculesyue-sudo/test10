'use client';

import { useEffect, useState } from 'react';

/**
 * 本月 AI 使費橫額 —— 只喺職員頁（/pro、/records）出現。
 *
 * 數據來自 GET /api/consult：有有效 staff cookie 先會有 budget 欄位，
 * 所以呢個 component 喺客人頁面就算擺咗都乜都唔顯示。
 * ≥90% 轉紅 —— 呢個就係「得返 10% 要提我」嗰下。
 */

interface BudgetInfo {
  monthSpentHKD: number;
  budgetHKD: number;
  analyses: number;
  pctUsed: number;
}

export default function BudgetBanner() {
  const [b, setB] = useState<BudgetInfo | null>(null);

  useEffect(() => {
    fetch('/api/consult')
      .then((r) => r.json())
      .then((d) => d.budget && setB(d.budget))
      .catch(() => {});
  }, []);

  if (!b) return null;

  const warn = b.pctUsed >= 90;
  const over = b.pctUsed >= 100;

  return (
    <div
      className={warn ? 'alert danger' : 'alert'}
      style={warn ? undefined : { background: 'var(--accent-soft)' }}
    >
      <b>
        本月 AI 使費：HK${b.monthSpentHKD.toFixed(2)} / HK${b.budgetHKD}（{b.analyses} 次分析 ·{' '}
        {Math.min(999, Math.round(b.pctUsed))}%）
      </b>
      <div style={{ fontSize: '0.8rem', marginTop: 3 }}>
        {over
          ? '預算已用晒 —— 客人分析已自動暫停（職員呢度照用，但每次都係真使費）。下月 1 號自動恢復。'
          : warn
            ? '就快用晒（剩唔夠 10%）。用晒之後客人分析會自動暫停，職員唔受影響。'
            : '每次分析按真實 token 數即時累計。'}
        {' '}想加預算：改 wrangler.jsonc 嘅 MONTHLY_AI_BUDGET_HKD 再重新部署。實際帳單以{' '}
        <a href="https://console.cloud.google.com/billing" target="_blank" rel="noreferrer">
          Google Cloud Billing
        </a>{' '}
        為準。
      </div>
    </div>
  );
}
