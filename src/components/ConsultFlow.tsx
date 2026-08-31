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
import ContactCard from '@/components/ContactCard';
import ConcernPicker from '@/components/ConcernPicker';
import AnalysisProgress from '@/components/AnalysisProgress';
import TurnstileWidget, { resetTurnstile, TURNSTILE_CONFIGURED } from '@/components/TurnstileWidget';
import { normalizeHKMobile } from '@/lib/visits';
import { type FindingKey, type GoalKey } from '@/lib/treatments/types';
import { goalsFromFindings, buildConcernNotes } from '@/lib/face-regions';
import { trackStep, resetTracking } from '@/lib/track-client';
import { scrollParentToTop } from '@/lib/embed-client';

const ONE_SHOT: Shot[] = [{ angle: '正面', label: '正面自拍', required: true }];

export default function ConsultFlow({ embedded = false }: { embedded?: boolean }) {
  const demo = useDemoMode();
  const isDemo = demo?.demo === true;

  const [shots, setShots] = useState<Shot[]>(ONE_SHOT);
  const [goals, setGoals] = useState<GoalKey[]>([]);
  const [selectedFindings, setSelectedFindings] = useState<FindingKey[]>([]);
  const [demoCaseId, setDemoCaseId] = useState<string | undefined>();
  const [consented, setConsented] = useState(false);
  const [ageBand, setAgeBand] = useState<string | null>(null);
  const [pregnant, setPregnant] = useState(false);
  const [custName, setCustName] = useState('');
  const [recPhone, setRecPhone] = useState('');
  const [leadConsent, setLeadConsent] = useState(false);
  const [tsToken, setTsToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<ConsultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [utm, setUtm] = useState<string | undefined>();

  useEffect(() => trackStep('page_view'), []);
  // 廣告來源標記：落地帶 ?utm_campaign=...（Meta 廣告直落 ai.drtimeless.com 本體），
  // 存 sessionStorage 等客人喺流程入面行嚟行去都唔甩；分析提交時帶俾 server 落 lead。
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const raw = sp.get('utm_campaign') || sp.get('utm_source');
      if (raw) {
        const v = raw.slice(0, 64);
        sessionStorage.setItem('drt_utm', v);
        setUtm(v);
      } else {
        const saved = sessionStorage.getItem('drt_utm');
        if (saved) setUtm(saved);
      }
    } catch {
      /* sessionStorage 唔可用（私隱模式等）—— 冇 utm 咪冇囉 */
    }
  }, []);
  useEffect(() => {
    if (shots[0]?.data) trackStep('photo_added');
  }, [shots]);
  useEffect(() => {
    if (goals.length > 0 || selectedFindings.length > 0) trackStep('goals_selected');
  }, [goals, selectedFindings]);
  useEffect(() => {
    if (consented) trackStep('consented');
  }, [consented]);

  const hasPhoto = Boolean(shots[0]?.data);
  // 測試模式冇真實相片，唔需要同意；正式模式：相片同意＋跟進同意＋
  // 香港手機號碼齊晒先可以提交。Turnstile 有設定嘅話仲要等 token 返嚟
  //（正常客人一秒內、隱形），咁先唔會撞 server 嗰邊嘅安全驗證。
  const phoneOk = normalizeHKMobile(recPhone) !== null;
  const tsOk = !TURNSTILE_CONFIGURED || tsToken !== '';
  const hasConcern = goals.length > 0 || selectedFindings.length > 0;
  const ready = (isDemo || (hasPhoto && consented && phoneOk && leadConsent && tsOk)) && hasConcern;

  /** 目標掣 + 面圖自選反推嘅目標，合併俾引擎（引擎以 goal 運作，唔使改）。 */
  const effectiveGoals = () => {
    const derived = goalsFromFindings(selectedFindings);
    return [...goals, ...derived.filter((g) => !goals.includes(g))];
  };

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
          goals: effectiveGoals(),
          notes: buildConcernNotes(selectedFindings),
          customerPhone: recPhone,
          customerName: custName.trim() || undefined,
          consent: leadConsent,
          turnstileToken: tsToken || undefined,
          utm,
          // tier 唔喺度指定 —— 由伺服器 CONSULT_TIER 決定（客人請求嘅 tier 伺服器一律唔理）
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
      // Turnstile token 係一次性 —— 失敗重試要個新嘅
      resetTurnstile();
      setTsToken('');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    resetTracking();
    setShots(ONE_SHOT);
    setGoals([]);
    setSelectedFindings([]);
    setConsented(false);
    setAgeBand(null);
    setPregnant(false);
    setCustName('');
    setRecPhone('');
    setLeadConsent(false);
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
        {/* 儲存結果要有交代 —— 客人剔咗個掣，唔可以唔知有冇成功 */}
        {data.record?.saved && data.record.persistent && (
          <div className="alert" style={{ background: 'var(--accent-soft)' }}>
            已儲存今次嘅評分紀錄（唔包括相片）。你可以隨時聯絡我哋要求刪除。
          </div>
        )}
        {data.record?.saved && !data.record.persistent && (
          <div className="alert warn">已記錄今次評分，但系統而家未接駁資料庫，紀錄未必可以長期保存。</div>
        )}
        {data.record && !data.record.saved && (
          <div className="alert warn">
            今次嘅評分紀錄儲存唔到{data.record.reason ? `（${data.record.reason}）` : ''}。你嘅分析結果唔受影響。
          </div>
        )}
        <MvpResult
          data={data}
          goals={effectiveGoals()}
          selectedFindings={selectedFindings}
          photoPreview={shots[0]?.preview}
          customerName={custName.trim() || undefined}
          customerPhone={normalizeHKMobile(recPhone) ?? undefined}
          onReset={reset}
          pregnant={pregnant}
        />
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
          <p>影一張相，AI 幫你睇清塊面而家嘅狀態</p>
        </header>
      )}

      {isDemo && <DemoBanner />}
      {error && <div className="alert danger">{error}</div>}

      {/* 價值帶：影相之前先話俾客人知會得到啲乜 —— 嵌入版（真客流路徑）
          冇 header，呢條係佢唯一嘅開場白，所以 embedded 都一定要出。 */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.7 }}>
          影一張相，AI 幫你做三樣嘢：
          <br />✓ 8 大範疇皮膚評分　✓ 喺你張相上面標出觀察位置　✓ 配對啱你嘅療程方向
        </p>
        <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          全程約 1 分鐘 · 免費 · 相片唔會被儲存
        </p>
      </div>

      <div className="card">
        <h2>
          1. 影張正面自拍
          {isDemo && (
            <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              （測試模式可以跳過）
            </span>
          )}
        </h2>
        <p className="sub">
          相片只用嚟即時分析，唔會儲存 —— 分析完成後，觀察位置會直接標返喺你呢張相上面（淨係你部機見到）。
        </p>
        <CaptureGuide />
        <div style={{ maxWidth: 200, margin: '14px auto 0' }}>
          <PhotoCapture shots={shots} onChange={setShots} />
        </div>
      </div>

      <div className="card">
        <h2>2. 你最想改善邊方面？</h2>
        <ConcernPicker
          selected={selectedFindings}
          onChange={setSelectedFindings}
          goals={goals}
          onGoals={setGoals}
        />
      </div>

      {!isDemo && (
        <ContactCard
          name={custName}
          onName={setCustName}
          phone={recPhone}
          onPhone={setRecPhone}
          consent={leadConsent}
          onConsent={setLeadConsent}
        />
      )}

      <QuickFacts ageBand={ageBand} onAge={setAgeBand} pregnant={pregnant} onPregnant={setPregnant} />

      {isDemo && demo && (
        <DemoCasePicker cases={demo.cases} value={demoCaseId} onChange={setDemoCaseId} />
      )}

      {!isDemo && <Consent checked={consented} onChange={setConsented} />}

      {!isDemo && <TurnstileWidget onToken={setTsToken} />}

      {busy ? (
        <AnalysisProgress demo={isDemo} photoPreview={shots[0]?.preview} />
      ) : (
        <button className="primary" disabled={!ready} onClick={submit}>
          {ready
            ? isDemo
              ? '睇示範結果'
              : '免費睇我嘅分析結果'
            : !isDemo && !hasPhoto
              ? '請先影相'
              : !hasConcern
                ? '請揀最少一項'
                : !isDemo && !phoneOk
                  ? '請輸入香港手機號碼'
                  : !isDemo && !leadConsent
                    ? '請同意保存紀錄同跟進安排'
                    : !isDemo && !consented
                      ? '請先同意相片處理說明'
                      : '安全驗證載入緊…'}
        </button>
      )}

      <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', textAlign: 'center', marginTop: 14 }}>
        分析結果屬初步參考，並非醫學診斷，唔可以取代註冊醫生嘅面診。
      </p>
    </>
  );
}
