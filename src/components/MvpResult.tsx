'use client';

import { FINDING_LABELS, type FindingKey, type GoalKey } from '@/lib/treatments/types';
import { buildBookingUrl } from '@/lib/booking';
import { CLINIC_POLICY, CLINIC_OTHER_SERVICES } from '@/lib/treatments/clinic';
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
}: {
  data: ConsultResponse;
  goals: GoalKey[];
  onReset: () => void;
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

      {a.imageQuality.makeupDetected && (
        <div className="alert warn">
          偵測到化妝 —— 色斑同泛紅嘅判斷會冇咁準。素顏重拍會準確好多。
        </div>
      )}

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

        {recs.length === 0 && (
          <p style={{ fontSize: '0.88rem', color: 'var(--text-dim)', margin: 0 }}>
            相片入面觀察唔到需要療程介入嘅明顯問題。想更深入評估，歡迎預約面診。
          </p>
        )}

        {recs.map((r, i) => (
          <div className="rec" key={r.treatment.id}>
            <div className="hd">
              <div>
                <b>
                  {i + 1}. {r.treatment.name}
                </b>
                <div className="brand">{r.treatment.brand}</div>
              </div>
            </div>
            <p>{r.rationale}</p>
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
          </div>
        ))}

        {recs.length > 0 && totalMax > 0 && (
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
        光線、角度、化妝都會影響判斷。喺香港，注射同高能量儀器療程均須由<b>註冊醫生</b>評估及施行。
        顯示「請洽診所」代表該療程價錢未錄入系統；一切收費以診所報價為準。
      </div>
    </>
  );
}
