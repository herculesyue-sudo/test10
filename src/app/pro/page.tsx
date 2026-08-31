'use client';

import { useState } from 'react';
import PhotoCapture, { DEFAULT_SHOTS, type Shot } from '@/components/PhotoCapture';
import AnalysisProgress from '@/components/AnalysisProgress';
import Report, { type ConsultResponse } from '@/components/Report';
import { useDemoMode, DemoBanner, DemoCasePicker } from '@/components/DemoMode';
import Consent from '@/components/Consent';
import SaveRecordCard from '@/components/SaveRecordCard';
import { GOALS, type GoalKey } from '@/lib/treatments/types';
import { PRICING_ENABLED } from '@/lib/treatments';

type Step = 'photo' | 'goals' | 'loading' | 'report';

const TIER_OPTIONS = [
  { key: 'budget', label: '經濟', hint: '最平 · 約 HK$0.05/次' },
  { key: 'balanced', label: '推薦', hint: '平衡 · 約 HK$0.25/次' },
  { key: 'max', label: '最準', hint: '最高準確度 · 約 HK$0.70/次' },
] as const;

export default function Page() {
  const demo = useDemoMode();
  const isDemo = demo?.demo === true;
  const [demoCaseId, setDemoCaseId] = useState<string | undefined>();
  const [consented, setConsented] = useState(false);
  const [recPhone, setRecPhone] = useState('');
  const [recConsent, setRecConsent] = useState(false);
  const [step, setStep] = useState<Step>('photo');
  const [shots, setShots] = useState<Shot[]>(DEFAULT_SHOTS);
  const [goals, setGoals] = useState<GoalKey[]>([]);
  const [notes, setNotes] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [budget, setBudget] = useState('');
  const [downtime, setDowntime] = useState('');
  const [noInj, setNoInj] = useState(false);
  const [pregnant, setPregnant] = useState(false);
  const [tier, setTier] = useState<'budget' | 'balanced' | 'max'>('balanced');
  const [data, setData] = useState<ConsultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 測試模式唔需要相片 —— 冇相都要試得到
  const hasFront = isDemo || Boolean(shots[0]?.data);

  function toggleGoal(g: GoalKey) {
    setGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  async function submit() {
    setError(null);
    setStep('loading');
    try {
      const res = await fetch('/api/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: shots
            .filter((s) => s.data)
            .map((s) => ({ data: s.data, mediaType: s.mediaType, angle: s.angle })),
          goals,
          notes: notes || undefined,
          age: age ? Number(age) : undefined,
          gender: gender || undefined,
          tier,
          record: recConsent && recPhone ? { phone: recPhone, consent: true } : undefined,
          budgetHKD: budget ? Number(budget) : undefined,
          maxDowntimeDays: downtime ? Number(downtime) : undefined,
          noInjectables: noInj,
          isPregnantOrNursing: pregnant,
          demoCaseId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '分析失敗');
      setData(json);
      setStep('report');
    } catch (e) {
      setError((e as Error).message);
      setStep('goals');
    }
  }

  function reset() {
    setShots(DEFAULT_SHOTS);
    setGoals([]);
    setConsented(false);
    setRecPhone('');
    setRecConsent(false);
    setNotes('');
    setData(null);
    setError(null);
    setStep('photo');
  }

  const stepIndex = { photo: 0, goals: 1, loading: 2, report: 2 }[step];

  return (
    <div className="wrap">
      <header className="site">
        <h1>AI 視像面診</h1>
        <p>
          自拍分析 · 香港可用療程配對 ·{' '}
          <a href="/records" style={{ color: 'var(--accent)' }}>
            📋 客人紀錄
          </a>
        </p>
      </header>

      {isDemo && step !== 'report' && <DemoBanner />}

      <div className="steps">
        {[0, 1, 2].map((i) => (
          <div key={i} className={i <= stepIndex ? 'on' : ''} />
        ))}
      </div>

      {step === 'photo' && (
        <>
          <div className="card">
            <h2>1. 拍攝相片</h2>
            <p className="sub">
              素顏、自然光、對正鏡頭、除低眼鏡同劉海。正面必須提供；加埋左右側面，AI 先睇到下顎線同輪廓。
            </p>
            <PhotoCapture shots={shots} onChange={setShots} />
          </div>

          <div className="card">
            <h2>影相貼士</h2>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
              <div>· 面向窗口自然光最好，避免頭頂燈（會做出假陰影，令 AI 誤判凹陷）</div>
              <div>· 表情放鬆，唔好笑 — 動態紋同靜態紋要分開睇</div>
              <div>· 頭髮撥開，露出額頭同下顎線</div>
              <div>· 相片只會傳去 AI 分析，唔會存喺伺服器（如客人同意儲存紀錄，只會儲評分數字，唔會儲相片）</div>
            </div>
          </div>

          <button className="primary" disabled={!hasFront} onClick={() => setStep('goals')}>
            {hasFront ? '下一步' : '請先影正面相'}
          </button>
        </>
      )}

      {step === 'goals' && (
        <>
          {error && <div className="alert danger">{error}</div>}

          <div className="card">
            <h2>2. 你想改善咩？</h2>
            <p className="sub">可揀多過一項。揀咗嘅範疇喺配對時會加權，但 AI 唔會為咗迎合而作出唔存在嘅問題。</p>
            <div className="goals">
              {GOALS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  className={`goal${goals.includes(g.key) ? ' on' : ''}`}
                  onClick={() => toggleGoal(g.key)}
                >
                  <b>{g.label}</b>
                  <span>{g.desc}</span>
                </button>
              ))}
            </div>

            <label className="f" htmlFor="notes">
              補充說明（可選）
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例如：最近半年法令紋深咗好多、之前打過透明質酸、皮膚易敏感…"
            />
          </div>

          <div className="card">
            <h2>3. 個人條件</h2>
            <p className="sub">
              用嚟過濾唔適合嘅療程{PRICING_ENABLED ? '同估算預算' : ''}。全部可以留空。
            </p>
            <div className="row">
              <div>
                <label className="f" htmlFor="age">
                  年齡
                </label>
                <input id="age" type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
              </div>
              <div>
                <label className="f" htmlFor="gender">
                  性別
                </label>
                <select id="gender" value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">不提供</option>
                  <option value="女">女</option>
                  <option value="男">男</option>
                  <option value="其他">其他</option>
                </select>
              </div>
            </div>
            <div className={PRICING_ENABLED ? 'row' : undefined}>
              {/* 目錄未有真實價錢就唔問預算 —— 問完做唔到嘢，只會令人覺得個系統壞咗 */}
              {PRICING_ENABLED && (
                <div>
                  <label className="f" htmlFor="budget">
                    預算上限 (HK$)
                  </label>
                  <input
                    id="budget"
                    type="number"
                    inputMode="numeric"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="例如 30000"
                  />
                </div>
              )}
              <div>
                <label className="f" htmlFor="downtime">
                  可接受停工期（日）
                </label>
                <input
                  id="downtime"
                  type="number"
                  inputMode="numeric"
                  value={downtime}
                  onChange={(e) => setDowntime(e.target.value)}
                  placeholder="例如 2"
                />
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={noInj} onChange={(e) => setNoInj(e.target.checked)} />
              <span>唔想打針（只顯示儀器同護理類療程）</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={pregnant} onChange={(e) => setPregnant(e.target.checked)} />
              <span>懷孕中 / 哺乳期（會自動排除所有相關禁忌療程）</span>
            </label>
          </div>

          {isDemo && demo && (
            <DemoCasePicker cases={demo.cases} value={demoCaseId} onChange={setDemoCaseId} />
          )}

          {!isDemo && <Consent checked={consented} onChange={setConsented} />}

          <SaveRecordCard
            staffMode
            phone={recPhone}
            onPhone={setRecPhone}
            consented={recConsent}
            onConsent={setRecConsent}
          />

          <div className="card">
            <h2>4. 分析模式</h2>
            <p className="sub">準確度同成本嘅取捨。診所自用建議「推薦」；免費體驗版可用「經濟」。</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {TIER_OPTIONS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`goal${tier === t.key ? ' on' : ''}`}
                  onClick={() => setTier(t.key)}
                >
                  <b>{t.label}</b>
                  <span>{t.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="ghost" onClick={() => setStep('photo')}>
              上一步
            </button>
            <button
              className="primary"
              style={{ marginTop: 0 }}
              onClick={submit}
              disabled={!isDemo && !consented}
            >
              {isDemo || consented ? '開始分析' : '請先取得客人同意'}
            </button>
          </div>
        </>
      )}

      {step === 'loading' && <AnalysisProgress demo={isDemo} />}

      {step === 'report' && data && (
        <>
          {data.meta.demo && <DemoBanner caseLabel={data.meta.demoCaseLabel} />}
          <Report data={data} onReset={reset} />
        </>
      )}
    </div>
  );
}
