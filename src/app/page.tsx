'use client';

/**
 * MVP：俾客人用嘅最短路徑。
 *
 * 一版過，唔分步驟：影相 → 揀想改善 → 撳一下 → 出結果 → 預約。
 *
 * 刻意省略咗（喺 /pro 有）：側面相、年齡性別、預算、停工期、模式選擇、
 * 分階段方案、逐項療程詳情。每加一格輸入就跌一批客人；MVP 嘅目標
 * 唔係做到最準，而係搵出「客人肯唔肯影相同肯唔肯㩒預約」。
 *
 * 固定行 budget 模式（約 HK$0.05 一次）—— 免費體驗版燒唔起貴模型。
 */

import { useState } from 'react';
import PhotoCapture, { type Shot } from '@/components/PhotoCapture';
import MvpResult, { type ConsultResponse } from '@/components/MvpResult';
import { GOALS, type GoalKey } from '@/lib/treatments/types';

const ONE_SHOT: Shot[] = [{ angle: '正面', label: '正面自拍', required: true }];

export default function Page() {
  const [shots, setShots] = useState<Shot[]>(ONE_SHOT);
  const [goals, setGoals] = useState<GoalKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<ConsultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(shots[0]?.data) && goals.length > 0;

  function toggle(g: GoalKey) {
    setGoals((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]));
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: [{ data: shots[0].data, mediaType: shots[0].mediaType, angle: '正面' }],
          goals,
          tier: 'budget',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '分析失敗');
      setData(json);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setShots(ONE_SHOT);
    setGoals([]);
    setData(null);
    setError(null);
    window.scrollTo({ top: 0 });
  }

  if (data) {
    return (
      <div className="wrap">
        <header className="site">
          <h1>你嘅分析結果</h1>
          <p>{process.env.NEXT_PUBLIC_CLINIC_NAME || 'AI 視像面診'}</p>
        </header>
        <MvpResult data={data} goals={goals} onReset={reset} />
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="site">
        <h1>AI 免費面部分析</h1>
        <p>自拍一張相，30 秒睇到適合你嘅療程方向</p>
      </header>

      {error && <div className="alert danger">{error}</div>}

      <div className="card">
        <h2>1. 影張正面自拍</h2>
        <p className="sub">素顏、自然光、對正鏡頭、唔好笑。相片只用嚟即時分析，唔會儲存。</p>
        <div style={{ maxWidth: 200, margin: '0 auto' }}>
          <PhotoCapture shots={shots} onChange={setShots} />
        </div>
      </div>

      <div className="card">
        <h2>2. 你最想改善邊方面？</h2>
        <p className="sub">可以揀多過一項。</p>
        <div className="goals">
          {GOALS.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`goal${goals.includes(g.key) ? ' on' : ''}`}
              onClick={() => toggle(g.key)}
            >
              <b>{g.label}</b>
              <span>{g.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <button className="primary" disabled={!ready || busy} onClick={submit}>
        {busy ? '分析緊…（約 30 秒）' : ready ? '免費分析' : !shots[0]?.data ? '請先影相' : '請揀最少一項'}
      </button>

      <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', textAlign: 'center', marginTop: 14 }}>
        分析結果屬初步參考，並非醫學診斷，唔可以取代註冊醫生嘅面診。
      </p>
    </div>
  );
}
