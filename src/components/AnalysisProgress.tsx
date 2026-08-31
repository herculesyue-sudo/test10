'use client';

import { useEffect, useState } from 'react';

/**
 * 分析等待卡 —— 20–60 秒嘅空窗期以前只係一個灰咗嘅掣。
 *
 * 步驟鏡射真實 pipeline（上載 → 質素檢查 → 觀察 → 配對），用本地
 * timer 推進；**最尾一步會一直轉到真回應返嚟為止** —— 絕唔虛報
 * 一個未發生嘅「完成」。
 */
const STEPS = [
  { at: 0, label: '相片上載' },
  { at: 2, label: '影像質素檢查' },
  { at: 8, label: '逐項觀察膚況' },
  { at: 18, label: '配對療程方向' },
];

export default function AnalysisProgress({ demo = false }: { demo?: boolean }) {
  const [sec, setSec] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const current = STEPS.reduce((acc, s, i) => (sec >= s.at ? i : acc), 0);

  return (
    <div className="card progress-card" role="status" aria-live="polite">
      <h2>{demo ? '產生示範結果…' : '分析緊你嘅相片…'}</h2>
      <div className="progress-steps">
        {STEPS.map((s, i) => (
          <div key={s.label} className={`step${i < current ? ' done' : i === current ? ' now' : ''}`}>
            <span className="dot" aria-hidden="true">
              {i < current ? '✓' : ''}
            </span>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <p className="sub" style={{ margin: '12px 0 0', textAlign: 'center' }}>
        一般需要 20–60 秒，唔好離開呢一頁。
      </p>
    </div>
  );
}
