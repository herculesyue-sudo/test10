'use client';

import { FINDING_LABELS, type FindingKey } from '@/lib/treatments/types';
import { CLINIC_POLICY } from '@/lib/treatments/clinic';
import CategoryScores from '@/components/CategoryScores';

export interface ConsultResponse {
  analysis: {
    imageQuality: { usable: boolean; lighting: string; issues: string[]; makeupDetected: boolean };
    structure: {
      faceShape: string;
      faceShapeNote: string;
      symmetryScore: number;
      agingPattern: string;
      estimatedSkinType: string;
    };
    findings: { key: string; severity: number; confidence: number; observation: string; location: string }[];
    overallSummary: string;
    redFlags: string[];
    /** 面部定位點（0-1 相片比例；postProcess 已消毒）—— 真相版觀察圖用 */
    landmarks?: {
      leftEye: { x: number; y: number };
      rightEye: { x: number; y: number };
      mouthCenter: { x: number; y: number };
      chin?: { x: number; y: number };
    };
  };
  recommendations: {
    treatment: {
      id: string;
      name: string;
      brand: string;
      category: string;
      family: string;
      mechanism: string;
      sessions: string;
      interval: string;
      onset: string;
      duration: string;
      downtimeDays: [number, number];
      priceHKD: { min: number; max: number; unit: string };
      risk: string;
      regulation: string;
      contraindications: string[];
      notes?: string;
    };
    score: number;
    targets: { key: string; label: string; severity: number; efficacy: number }[];
    rationale: string;
    flags: string[];
    estCostHKD: { min: number; max: number };
    priceConfirmed: boolean;
  }[];
  goalCoverage?: { goal: string; label: string; covered: boolean }[];
  /** 有嘗試儲存先會出現（SaveRecordCard 自願opt-in） */
  record?: { saved: boolean; persistent: boolean; reason?: string };
  usability?: { ok: boolean; reason?: string; retakeHints: string[] };
  plan: {
    phase: number;
    title: string;
    timing: string;
    items: ConsultResponse['recommendations'];
    subtotalHKD: { min: number; max: number };
    hasUnpricedItems: boolean;
  }[];
  meta: {
    model: string;
    tier: string;
    tierLabel: string;
    passes: number;
    usage: { inputTokens: number; outputTokens: number };
    costHKD: number;
    /** 目錄有真實價錢先會 true；false 時所有價格版面都收起 */
    pricingEnabled?: boolean;
    /** 測試模式先會有 */
    demo?: boolean;
    demoCaseId?: string;
    demoCaseLabel?: string;
  };
}

const FACE_SHAPE: Record<string, string> = {
  oval: '鵝蛋面',
  round: '圓面',
  square: '方面 / 國字面',
  heart: '心形面',
  long: '長面',
  diamond: '菱形面',
  uncertain: '未能確定',
};

const AGING: Record<string, string> = {
  volume_loss: '容積流失為主',
  laxity: '鬆弛為主',
  photoaging: '光老化為主',
  mixed: '混合型',
  minimal: '老化跡象輕微',
};

const money = (n: number) => `HK$${Math.round(n).toLocaleString()}`;
const TBC = '請洽診所';

function confLabel(c: number) {
  if (c >= 0.75) return '信心高';
  if (c >= 0.5) return '信心中';
  return '信心低 · 建議現場再睇';
}

export default function Report({ data, onReset }: { data: ConsultResponse; onReset: () => void }) {
  const { analysis: a, recommendations: recs, plan, meta } = data;
  const showPricing = meta.pricingEnabled === true;
  const total = plan.reduce(
    (s, p) => ({ min: s.min + p.subtotalHKD.min, max: s.max + p.subtotalHKD.max }),
    { min: 0, max: 0 },
  );

  return (
    <>
      {a.redFlags.length > 0 && (
        <div className="alert danger">
          <b>⚠️ 需要醫生檢查</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {a.redFlags.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {(!a.imageQuality.usable || a.imageQuality.makeupDetected || a.imageQuality.issues.length > 0) && (
        <div className="alert warn">
          <b>相片質素備註</b>
          <div style={{ marginTop: 4 }}>
            {a.imageQuality.makeupDetected && <div>· 偵測到化妝 — 色斑同泛紅嘅判斷準確度會下降，建議素顏重拍</div>}
            {a.imageQuality.lighting !== 'good' && <div>· 光線{a.imageQuality.lighting === 'poor' ? '不足' : '一般'}</div>}
            {a.imageQuality.issues.map((x, i) => (
              <div key={i}>· {x}</div>
            ))}
          </div>
        </div>
      )}

      <CategoryScores findings={a.findings} />

      {/* ── 總結 ── */}
      <div className="card">
        <h2>分析總結</h2>
        <p style={{ margin: '0 0 14px', fontSize: '0.92rem' }}>{a.overallSummary}</p>
        <div className="meta" style={{ gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
          <span>
            面形：<b>{FACE_SHAPE[a.structure.faceShape] ?? a.structure.faceShape}</b>
          </span>
          <span>
            對稱度：<b>{a.structure.symmetryScore}/100</b>
          </span>
          <span>
            老化模式：<b>{AGING[a.structure.agingPattern] ?? a.structure.agingPattern}</b>
          </span>
          <span>
            膚質類型：<b>Fitzpatrick {a.structure.estimatedSkinType}</b>
          </span>
        </div>
        <p style={{ marginTop: 12, fontSize: '0.84rem', color: 'var(--text-dim)' }}>{a.structure.faceShapeNote}</p>
      </div>

      {/* ── 觀察 ── */}
      <div className="card">
        <h2>觀察項目</h2>
        <p className="sub">按嚴重程度排序。信心低嘅項目代表相片限制，唔代表冇問題。</p>
        {a.findings.length === 0 ? (
          <p style={{ fontSize: '0.88rem', color: 'var(--text-dim)' }}>
            相片入面觀察唔到明顯問題。可能係相片限制，亦可能係狀況本身良好。
          </p>
        ) : (
          [...a.findings]
            .sort((x, y) => y.severity - x.severity)
            .map((f) => (
              <div className="finding" key={f.key}>
                <div className="top">
                  <b>{FINDING_LABELS[f.key as FindingKey] ?? f.key}</b>
                  <em>
                    {f.severity}/100 · {confLabel(f.confidence)}
                  </em>
                </div>
                <div className="bar">
                  <i style={{ width: `${f.severity}%`, opacity: 0.35 + f.confidence * 0.65 }} />
                </div>
                <p>
                  {f.location && f.location !== '整體' ? `【${f.location}】` : ''}
                  {f.observation}
                </p>
              </div>
            ))
        )}
      </div>

      {/* ── 分階段方案 ── */}
      {plan.length > 0 && (
        <div className="card">
          <h2>建議方案（分階段）</h2>
          <p className="sub">
            先處理發炎同色素，再做結構性緊緻，最後先補容積 — 咁樣每一步嘅效果先睇得清，亦避免同時做太多。
          </p>
          {plan.map((p) => (
            <div key={p.phase} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <b style={{ fontSize: '0.92rem' }}>
                  第 {p.phase} 階段 · {p.title}
                </b>
                <em style={{ fontStyle: 'normal', fontSize: '0.76rem', color: 'var(--text-dim)' }}>{p.timing}</em>
              </div>
              <div style={{ marginTop: 6 }}>
                {p.items.map((it) => (
                  <span className="pill" key={it.treatment.id}>
                    {it.treatment.name}
                  </span>
                ))}
              </div>
              {showPricing && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 4 }}>
                  {p.subtotalHKD.max > 0
                    ? `小計約 ${money(p.subtotalHKD.min)} – ${money(p.subtotalHKD.max)}`
                    : `小計：${TBC}`}
                  {p.hasUnpricedItems && p.subtotalHKD.max > 0 && '（部分療程價格未列，實際會更高）'}
                </div>
              )}
            </div>
          ))}
          {showPricing && (
            <>
              <div
                style={{
                  borderTop: '1px solid var(--border)',
                  paddingTop: 12,
                  fontSize: '0.9rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <b>整體預算估算</b>
                <b>{total.max > 0 ? `${money(total.min)} – ${money(total.max)}` : TBC}</b>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 6, marginBottom: 0 }}>
                價格以診所報價為準。顯示「{TBC}」代表該療程價錢未錄入系統。
              </p>
            </>
          )}
        </div>
      )}

      {/* ── 逐項療程 ── */}
      <div className="card">
        <h2>療程詳情</h2>
        <p className="sub">
          只包含 {CLINIC_POLICY.name} 實際提供嘅療程。配對分數由本地規則引擎計算
          （嚴重程度 × 療效權重 × 判斷信心），可追溯。
        </p>
        {recs.length === 0 && (
          <p style={{ fontSize: '0.88rem', color: 'var(--text-dim)', margin: 0 }}>
            按你嘅條件，暫時冇適合推薦嘅療程。常見原因：
            <br />· 已剔選懷孕 / 哺乳 —— 絕大部分注射同高能量儀器療程喺呢段時期都屬禁忌，建議產後再評估
            <br />· 已剔選「唔想打針」，而你嘅主要問題需要容積補充
            <br />· 相片入面觀察到嘅問題都屬輕微，未去到需要療程介入嘅程度
          </p>
        )}
        {recs.map((r) => (
          <div className="rec" key={r.treatment.id}>
            <div className="hd">
              <div>
                <b>{r.treatment.name}</b>
                <div className="brand">
                  {r.treatment.brand} · {r.treatment.family}
                </div>
              </div>
              <span className="score">{r.score}</span>
            </div>
            <p>{r.rationale}</p>
            <div style={{ marginBottom: 9 }}>
              {r.targets.map((t) => (
                <span className="pill" key={t.key}>
                  {t.label}
                </span>
              ))}
            </div>
            <div className="meta">
              <span>
                次數：<b>{r.treatment.sessions}</b>
              </span>
              <span>
                間隔：<b>{r.treatment.interval}</b>
              </span>
              <span>
                見效：<b>{r.treatment.onset}</b>
              </span>
              <span>
                維持：<b>{r.treatment.duration}</b>
              </span>
              <span>
                停工期：
                <b>
                  {r.treatment.downtimeDays[0] === r.treatment.downtimeDays[1]
                    ? `${r.treatment.downtimeDays[0]} 日`
                    : `${r.treatment.downtimeDays[0]}–${r.treatment.downtimeDays[1]} 日`}
                </b>
              </span>
              {showPricing && (
                <span>
                  價錢：
                  <b>
                    {r.priceConfirmed
                      ? `${money(r.treatment.priceHKD.min)}–${money(r.treatment.priceHKD.max)}`
                      : TBC}
                  </b>
                  {r.priceConfirmed && (
                    <>
                      <br />
                      <span style={{ fontSize: '0.72rem' }}>{r.treatment.priceHKD.unit}</span>
                    </>
                  )}
                </span>
              )}
            </div>
            {showPricing && r.priceConfirmed && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 8 }}>
                全期估算：
                <b style={{ color: 'var(--text)' }}>
                  {money(r.estCostHKD.min)} – {money(r.estCostHKD.max)}
                </b>
              </div>
            )}
            {r.treatment.notes && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 6 }}>
                📌 {r.treatment.notes}
              </div>
            )}
            <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: 6 }}>
              禁忌：{r.treatment.contraindications.join('、')}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: 4 }}>
              規管：{r.treatment.regulation}
            </div>
            {r.flags.length > 0 && (
              <div className="flags">
                {r.flags.map((f, i) => (
                  <div key={i}>{f}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="disclaimer">
        <b>重要聲明</b>
        <br />
        呢份報告由 AI 根據相片產生，屬<b>初步參考</b>，並非醫學診斷，亦唔可以取代註冊醫生嘅面對面檢查。
        相片分析先天有限制：光線、角度、化妝、螢幕色差都會影響判斷，而且好多皮膚問題（例如色素嘅深淺層次、
        皮下組織狀況）根本無法單靠相片確認。
        <br />
        <br />
        喺香港，注射類療程須由<b>註冊醫生</b>施行；高能量儀器療程進行之前亦須經<b>註冊醫生</b>評估。落實任何療程前，請親身諮詢醫生，
        並主動申報病史、藥物同過敏。如報告提示需要醫生檢查嘅皮膚病變，請盡快求診皮膚科。
        <br />
        <br />
        所有價格為市場公開參考區間，僅作預算估算，唔構成報價或要約。
      </div>

      <div className="cost">
        {meta.demo ? (
          <>🧪 測試模式 · 示範數據 · 冇呼叫 AI · 零成本</>
        ) : (
          <>
        {meta.tierLabel} · {meta.model}
        {meta.passes > 1 ? ` · ${meta.passes} 次共識分析` : ''} · 本次 AI 成本 HK${meta.costHKD.toFixed(2)}（
        {meta.usage.inputTokens.toLocaleString()} in / {meta.usage.outputTokens.toLocaleString()} out）
          </>
        )}
      </div>

      <button className="primary" onClick={onReset} style={{ marginTop: 18 }}>
        重新分析
      </button>
    </>
  );
}
