'use client';

import { useEffect, useState } from 'react';

export interface DemoInfo {
  demo: boolean;
  cases: { id: string; label: string }[];
}

/** 問後端而家係咪測試模式。單一真相來源 —— 唔使前後端各設一次 env。 */
export function useDemoMode(): DemoInfo | null {
  const [info, setInfo] = useState<DemoInfo | null>(null);
  useEffect(() => {
    fetch('/api/consult')
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo({ demo: false, cases: [] }));
  }, []);
  return info;
}

/**
 * 測試模式橫額。
 *
 * 做到好明顯係刻意嘅：如果診所職員唔小心喺測試模式落攞個報告俾客人睇，
 * 就變咗攞示範數據當真實分析 —— 呢個係最需要避免嘅失效方式。
 */
export function DemoBanner({ caseLabel }: { caseLabel?: string }) {
  return (
    <div
      className="alert warn"
      style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderWidth: 2 }}
    >
      <span style={{ fontSize: '1.1rem', lineHeight: 1.3 }}>🧪</span>
      <div>
        <b>測試模式 —— 以下唔係真實分析</b>
        <div style={{ marginTop: 2 }}>
          顯示緊嘅係預設示範數據，冇呼叫過 AI、冇產生費用。
          {caseLabel && (
            <>
              <br />
              示範個案：<b>{caseLabel}</b>
            </>
          )}
          <br />
          <span style={{ opacity: 0.85 }}>
            療程配對、價格、預約連結全部行緊真嘅邏輯 —— 只有「睇相結果」係假。
            <br />
            要用真實分析：喺 <code>.env</code> 移除 <code>DEMO_MODE</code> 並填入{' '}
            <code>ANTHROPIC_API_KEY</code>。
          </span>
        </div>
      </div>
    </div>
  );
}

/** 示範個案選擇器 —— 令你可以逐個情境睇曬（包括紅旗警示）。 */
export function DemoCasePicker({
  cases,
  value,
  onChange,
}: {
  cases: DemoInfo['cases'];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  if (cases.length === 0) return null;
  return (
    <div className="card">
      <h2>🧪 揀示範個案</h2>
      <p className="sub">測試模式專用。揀「自動」就會按你揀嘅改善目標配對最貼題嘅個案。</p>
      <div style={{ display: 'grid', gap: 8 }}>
        <button
          type="button"
          className={`goal${!value ? ' on' : ''}`}
          onClick={() => onChange(undefined)}
        >
          <b>自動配對</b>
          <span>按你揀嘅目標決定</span>
        </button>
        {cases.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`goal${value === c.id ? ' on' : ''}`}
            onClick={() => onChange(c.id)}
          >
            <b>{c.label}</b>
          </button>
        ))}
      </div>
    </div>
  );
}
