'use client';

/**
 * 客人流程本體，`/` 同 `/embed` 共用。
 *
 * 抽出嚟嘅原因好實際：呢個流程有同意閘、埋點、相片預檢、錯誤處理。
 * 複製多一份去 embed 版，兩邊一定會走樣 —— 而走樣嘅嗰邊多數係
 * 診所實際用緊嗰邊（因為官網嵌入版先係真正有客流嗰個）。
 */

import { useEffect, useState } from 'react';
import PhotoCapture, { type Shot } from '@/components/PhotoCapture';
import MvpResult, { type ConsultResponse } from '@/components/MvpResult';
import { useDemoMode, DemoBanner, DemoCasePicker } from '@/components/DemoMode';
import Consent from '@/components/Consent';
import CaptureGuide from '@/components/CaptureGuide';
import QuickFacts, { ageFromBand } from '@/components/QuickFacts';
import { GOALS, type GoalKey } from '@/lib/treatments/types';
import { trackStep, resetTracking } from '@/lib/track-client';
import { scrollParentToTop } from '@/lib/embed-client';

const ONE_SHOT: Shot[] = [{ angle: '正面', label: '正面自拍', required: true }];

export default function ConsultFlow({ embedded = false }: { embedded?: boolean }) {
  const demo = useDemoMode();
  const isDemo = demo?.demo === true;

  const [shots, setShots] = useState<Shot[]>(ONE_SHOT);
  const [goals, setGoals] = useState<GoalKey[]>([]);
  const [demoCaseId, setDemoCaseId] = useState<string | undefined>();
  const [consented, setConsented] = useState(false);
  const [ageBand, setAgeBand] = useState<string | null>(null);
  const [pregnant, setPregnant] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<ConsultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => trackStep('page_view'), []);
  useEffect(() => {
    if (shots[0]?.data) trackStep('photo_added');
  }, [shots]);
  useEffect(() => {
    if (goals.length > 0) trackStep('goals_selected');
  }, [goals]);
  useEffect(() => {
    if (consented) trackStep('consented');
  }, [consented]);

  const hasPhoto = Boolean(shots[0]?.data);
  // 測試模式冇真實相片，唔需要同意；正式模式一定要先同意先可以傳相
  const ready = (isDemo || (hasPhoto && consented)) && goals.length > 0;

  function toggle(g: GoalKey) {
    setGoals((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]));
  }

  async function submit() {
    setError(null);
    setBusy(true);
    trackStep('analyze_started');
    try {
      const res = await fetch('/api/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: hasPhoto
            ? [{ data: shots[0].data, mediaType: shots[0].mediaType, angle: '正面' }]
            : [],
          goals,
          tier: 'budget',
          age: ageFromBand(ageBand),
          // 安全閘：引擎會硬過濾所有懷孕禁忌療程
          isPregnantOrNursing: pregnant,
          demoCaseId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '分析失敗');
      trackStep('analyze_succeeded');
      setData(json);
      scrollParentToTop();
    } catch (e) {
      trackStep('analyze_failed');
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    resetTracking();
    setShots(ONE_SHOT);
    setGoals([]);
    setConsented(false);
    setAgeBand(null);
    setPregnant(false);
    setData(null);
    setError(null);
    scrollParentToTop();
  }

  if (data) {
    return (
      <>
        {!embedded && (
          <header className="site">
            <h1>你嘅分析結果</h1>
            <p>{process.env.NEXT_PUBLIC_CLINIC_NAME || 'AI 視像面診'}</p>
          </header>
        )}
        {data.meta.demo && <DemoBanner caseLabel={data.meta.demoCaseLabel} />}
        <MvpResult data={data} goals={goals} onReset={reset} pregnant={pregnant} />
      </>
    );
  }

  return (
    <>
      {/* 嵌入版唔重複標題 —— 客人已經喺診所官網嘅版面入面，
          再出多一個大標題會好似入咗第二個網站。 */}
      {!embedded && (
        <header className="site">
          <h1>AI 免費面部分析</h1>
          <p>自拍一張相，30 秒睇到適合你嘅療程方向</p>
        </header>
      )}

      {isDemo && <DemoBanner />}
      {error && <div className="alert danger">{error}</div>}

      <div className="card">
        <h2>
          1. 影張正面自拍
          {isDemo && (
            <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              （測試模式可以跳過）
            </span>
          )}
        </h2>
        <p className="sub">相片只用嚟即時分析，唔會儲存。</p>
        <CaptureGuide />
        <div style={{ maxWidth: 200, margin: '14px auto 0' }}>
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

      <QuickFacts ageBand={ageBand} onAge={setAgeBand} pregnant={pregnant} onPregnant={setPregnant} />

      {isDemo && demo && (
        <DemoCasePicker cases={demo.cases} value={demoCaseId} onChange={setDemoCaseId} />
      )}

      {!isDemo && <Consent checked={consented} onChange={setConsented} />}

      <button className="primary" disabled={!ready || busy} onClick={submit}>
        {busy
          ? isDemo
            ? '產生示範結果…'
            : '分析緊…（約 30 秒）'
          : ready
            ? isDemo
              ? '睇示範結果'
              : '免費分析'
            : !isDemo && !hasPhoto
              ? '請先影相'
              : goals.length === 0
                ? '請揀最少一項'
                : '請先同意相片處理說明'}
      </button>

      <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', textAlign: 'center', marginTop: 14 }}>
        分析結果屬初步參考，並非醫學診斷，唔可以取代註冊醫生嘅面診。
      </p>
    </>
  );
}
