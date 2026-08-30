'use client';

import {
  FINDING_LABELS,
  CATEGORY_LABELS,
  CATEGORY_EXPLAIN,
  type FindingKey,
  type GoalKey,
  type TreatmentCategory,
} from '@/lib/treatments/types';
import { buildBookingUrl } from '@/lib/booking';
import { trackStep } from '@/lib/track-client';
import { CLINIC_POLICY, CLINIC_OTHER_SERVICES } from '@/lib/treatments/clinic';
import CategoryScores from '@/components/CategoryScores';
import type { ConsultResponse } from './Report';

export type { ConsultResponse };

/** MVP 只展示頭 3 個建議 —— 揀太多等於冇揀。 */
const TOP_N = 3;

const money = (n: number) => `HK$${Math.round(n).toLocaleString()}`;

function downtimeText(d: [number, number]) {
  if (d[1] === 0) return '冇停工期';
  if (d[0] === 0) return `最多 ${d[1]} 日`;
  return `${d[0]}–${d[1]} 日`;
}

export default function MvpResult({
  data,
  goals,
  onReset,
  pregnant = false,
}: {
  data: ConsultResponse;
  goals: GoalKey[];
  onReset: () => void;
  /** 剔咗懷孕就會硬過濾所有禁忌療程 —— 一個建議都冇嘅時候要講返真正原因 */
  pregnant?: boolean;
}) {
  const { analysis: a } = data;
  const recs = data.recommendations.slice(0, TOP_N);
  const top = [...a.findings].sort((x, y) => y.severity - x.severity).slice(0, 4);
  const link = buildBookingUrl({
    phone: process.env.NEXT_PUBLIC_WHATSAPP,
    goals,
    treatments: recs.map((r) => r.treatment.name),
  });

  const totalMin = recs.reduce((s, r) => s + r.estCostHKD.min, 0);
  const totalMax = recs.reduce((s, r) => s + r.estCostHKD.max, 0);
  const anyUnpriced = recs.some((r) => !r.priceConfirmed);
  const showPricing = data.meta.pricingEnabled === true;
  const uncoveredGoals = (data.goalCoverage ?? []).filter((g) => !g.covered);

  // 固定次序：儀器 → 注射 → 外用。由低侵入性講起，客人比較收得落。
  const ORDER: TreatmentCategory[] = ['device', 'injectable', 'topical'];
  const kinds = ORDER.map((cat) => ({
    cat,
    count: recs.filter((r) => r.treatment.category === cat).length,
  })).filter((k) => k.count > 0);

  return (
    <>
      {a.redFlags.length > 0 && (
        <div className="alert danger">
          <b>⚠️ 建議先睇醫生</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {a.redFlags.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 相片唔夠好就直接講，唔好扮有結果。一份由爛相產生嘅精美報告，
          比冇報告更差 —— 客人會信咗，然後帶住錯嘅期望上嚟。 */}
      {data.usability && !data.usability.ok ? (
        <div className="alert warn">
          <b>⚠️ {data.usability.reason}</b>
          <p style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>下面嘅結果參考價值有限。重影一張會準確好多：</p>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.85rem' }}>
            {data.usability.retakeHints.slice(0, 4).map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      ) : (
        a.imageQuality.makeupDetected && (
          <div className="alert warn">
            偵測到化妝 —— 色斑同泛紅嘅判斷會冇咁準。素顏重拍會準確好多。
          </div>
        )
      )}

      {/* 雷達放喺質素警示之後 —— 一份「呢張相唔多好」嘅警告上面
          唔可以擺一個睇落好肯定嘅分數版面 */}
      <CategoryScores findings={a.findings} />

      <div className="card">
        <h2>我哋睇到咩</h2>
        <p style={{ margin: '0 0 14px', fontSize: '0.92rem' }}>{a.overallSummary}</p>
        {top.length > 0 &&
          top.map((f) => (
            <div className="finding" key={f.key}>
              <div className="top">
                <b>{FINDING_LABELS[f.key as FindingKey] ?? f.key}</b>
                <em>{f.severity >= 66 ? '明顯' : f.severity >= 41 ? '中度' : '輕微'}</em>
              </div>
              <div className="bar">
                <i style={{ width: `${f.severity}%` }} />
              </div>
              <p>{f.observation}</p>
            </div>
          ))}
      </div>

      <div className="card">
        <h2>建議療程方向</h2>
        <p className="sub">
          以下全部係 {CLINIC_POLICY.name} 實際提供嘅療程，根據你揀嘅目標同相片分析配對。
          {CLINIC_POLICY.payPerSession && <> {CLINIC_POLICY.payPerSessionNote}。</>}
        </p>

        {uncoveredGoals.length > 0 && recs.length > 0 && (
          <div className="alert warn" style={{ marginTop: 0 }}>
            你揀咗嘅<b>{uncoveredGoals.map((g) => g.label).join('、')}</b>，
            喺呢張相入面觀察唔到明顯相關問題，所以下面嘅建議未有直接針對 ——
            如果你自己覺得有，面診時同醫生講清楚會準確好多。
          </div>
        )}

        {/* 講咗有邊幾類，再逐個講。冇呢個總覽，客人係逐張卡咁睇，
            睇完都唔知自己張方案整體係「要打針」定「淨係做機」。 */}
        {kinds.length > 0 && (
          <div className="kinds">
            <p className="lead">
              你嘅方案包括{' '}
              {kinds.map((k, i) => (
                <span key={k.cat}>
                  {i > 0 && '、'}
                  <b>
                    {k.count} 個{CATEGORY_LABELS[k.cat]}
                  </b>
                </span>
              ))}
              。
            </p>
            {kinds.map((k) => (
              <p key={k.cat}>
                <b>{CATEGORY_LABELS[k.cat]}</b>：{CATEGORY_EXPLAIN[k.cat]}
              </p>
            ))}
          </div>
        )}

        {/* 一個建議都冇，可以係兩個完全唔同嘅原因。講錯咗就係誤導：
            一個懷孕嘅客人見到「你冇咩問題」，會以為自己唔使做嘢，
            而唔係知道係因為而家所有療程都唔適合佢。 */}
        {recs.length === 0 &&
          (pregnant ? (
            <div className="alert warn" style={{ marginTop: 0, marginBottom: 0 }}>
              <b>因為你話咗懷孕 / 餵人奶，所有療程都暫時過濾咗。</b>
              <p style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>
                激光、射頻、肉毒同填充喺呢段時間都唔適合，所以系統唔會建議任何一項 ——
                呢個係正常同安全嘅做法，唔代表你塊面冇嘢可以做。
                上面「我哋睇到咩」嗰部分嘅觀察仍然有效，可以留返做將來嘅參考。
                期間嘅日常護理同防曬，歡迎預約同醫生傾。
              </p>
            </div>
          ) : (
            <p style={{ fontSize: '0.88rem', color: 'var(--text-dim)', margin: 0 }}>
              相片入面觀察唔到需要療程介入嘅明顯問題。想更深入評估，歡迎預約面診。
            </p>
          ))}

        {recs.map((r, i) => (
          <div className="rec" key={r.treatment.id}>
            <div className="hd">
              <div>
                {/* 類型行喺療程名前面：客人未聽過「Ultraformer」，但一定知
                    「打針」同「做機」嘅分別，而嗰個分別先係佢即刻想知嘅嘢。 */}
                <div className="kind">{CATEGORY_LABELS[r.treatment.category as TreatmentCategory]}</div>
                <b>
                  {i + 1}. {r.treatment.name}
                </b>
              </div>
            </div>
            <p>{r.rationale}</p>
            {/* 客人見到「Botox · Dysport · Xeomin」三個名而冇解釋，會當係含糊；
                有咗「由醫生按部位揀」呢句，同一份資料就變咗賣點。 */}
            {r.treatment.notes && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: '0 0 8px' }}>
                📌 {r.treatment.notes}
              </p>
            )}
            <div className="meta">
              <span>
                次數：<b>{r.treatment.sessions}</b>
              </span>
              <span>
                見效：<b>{r.treatment.onset}</b>
              </span>
              <span>
                維持：<b>{r.treatment.duration}</b>
              </span>
              <span>
                停工期：<b>{downtimeText(r.treatment.downtimeDays)}</b>
              </span>
            </div>
            {showPricing && (
            <div style={{ fontSize: '0.82rem', marginTop: 8 }}>
              價錢：
              {r.priceConfirmed ? (
                <>
                  <b>
                    {money(r.treatment.priceHKD.min)}–{money(r.treatment.priceHKD.max)}
                  </b>
                  <span style={{ color: 'var(--text-dim)' }}> {r.treatment.priceHKD.unit}</span>
                </>
              ) : (
                <b>請洽診所</b>
              )}
            </div>
            )}
          </div>
        ))}

        {showPricing && recs.length > 0 && totalMax > 0 && (
          <div
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: 12,
              marginTop: 4,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.9rem',
            }}
          >
            <b>全期預算估算{anyUnpriced && '（部分未計）'}</b>
            <b>
              {money(totalMin)} – {money(totalMax)}
            </b>
          </div>
        )}
      </div>

      {CLINIC_OTHER_SERVICES.length > 0 && (
        <div className="card">
          <h2>其他服務</h2>
          <p className="sub">呢啲服務唔可以靠相片評估，需要醫生現場檢查。</p>
          {CLINIC_OTHER_SERVICES.map((s) => (
            <div className="finding" key={s.name}>
              <div className="top">
                <b>{s.name}</b>
              </div>
              <p>{s.note}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── 轉化 ── */}
      <div className="card" style={{ textAlign: 'center' }}>
        <h2>想知邊個方案最啱你？</h2>
        <p className="sub" style={{ marginBottom: 16 }}>
          相片分析有先天限制。註冊醫生面診先可以確認皮膚層次、彈性同病史，度身訂造方案。
        </p>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="primary"
            onClick={() => trackStep('booking_clicked')}
            style={{ display: 'block', textDecoration: 'none', marginTop: 0, boxSizing: 'border-box' }}
          >
            WhatsApp 預約免費諮詢
          </a>
        ) : (
          <div className="alert warn" style={{ textAlign: 'left', marginBottom: 0 }}>
            未設定 <code>NEXT_PUBLIC_WHATSAPP</code>，預約按鈕唔會顯示。喺 <code>.env</code> 填入診所 WhatsApp
            號碼（國際格式，例如 <code>85212345678</code>）後重新 build。
          </div>
        )}
        <button className="ghost" onClick={onReset} style={{ marginTop: 12, width: '100%' }}>
          再分析一次
        </button>
      </div>

      <div className="disclaimer">
        呢份報告由 AI 根據相片產生，屬<b>初步參考</b>，並非醫學診斷，唔可以取代註冊醫生嘅面對面檢查。
        光線、角度、化妝都會影響判斷。喺香港，注射類療程（肉毒、透明質酸等）須由<b>註冊醫生</b>施行；所有療程喺進行之前，均須經<b>註冊醫生</b>評估。
        {showPricing
          ? '顯示「請洽診所」代表該療程價錢未錄入系統；一切收費以診所報價為準。'
          : '療程收費請直接向診所查詢。'}
      </div>
    </>
  );
}
