'use client';

import { useState } from 'react';
import {
  FINDING_LABELS,
  CATEGORY_LABELS,
  CATEGORY_EXPLAIN,
  type FindingKey,
  type GoalKey,
  type TreatmentCategory,
} from '@/lib/treatments/types';
import {
  REGIONS_OF_FINDING,
  REGION_LABEL,
  primaryRegionOf,
  type FaceRegionKey,
} from '@/lib/face-regions';
import { buildReportBookingUrl } from '@/lib/booking';
import { computeCategoryScores } from '@/lib/categories';
import { trackStep } from '@/lib/track-client';
import { CLINIC_POLICY, CLINIC_OTHER_SERVICES } from '@/lib/treatments/clinic';
import CategoryScores from '@/components/CategoryScores';
import FaceMap from '@/components/FaceMap';
import PhotoFaceMap from '@/components/PhotoFaceMap';
import TreatmentTimeline from '@/components/TreatmentTimeline';
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

/** findings → 每區最高 severity，餵俾 FaceMap display 模式。 */
function regionHighlights(findings: { key: string; severity: number }[]): Partial<Record<FaceRegionKey, number>> {
  const out: Partial<Record<FaceRegionKey, number>> = {};
  for (const f of findings) {
    const key = f.key as FindingKey;
    if (!(key in FINDING_LABELS)) continue;
    for (const r of REGIONS_OF_FINDING[key] ?? []) {
      out[r] = Math.max(out[r] ?? 0, f.severity);
    }
  }
  return out;
}

/** overall_skin 有冇去到值得交代嘅程度（同 intensityOf 嘅 25 下限一致）。 */
const intensityOfOverall = (v: number) => v >= 25;

/** 長觀察句預設兩行 clamp，撳先展開 —— 圖行先、字跟後。 */
function ClampText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 42;
  if (!long) return <p>{text}</p>;
  return (
    <p className={open ? '' : 'clamp2'} onClick={() => setOpen((v) => !v)} style={{ cursor: 'pointer' }}>
      {text}
      {!open && <span className="expand-hint"> 展開</span>}
    </p>
  );
}

export default function MvpResult({
  data,
  goals,
  selectedFindings = [],
  photoPreview,
  customerName,
  customerPhone,
  onReset,
  pregnant = false,
}: {
  data: ConsultResponse;
  goals: GoalKey[];
  /** 客人喺面圖自選嘅問題 —— 用嚟講返「你揀咗但相中觀察唔到」嘅誠實一句 */
  selectedFindings?: FindingKey[];
  /** 客人張相（dataURL，只存在於瀏覽器狀態）—— 有埋 landmarks 先會出真相版觀察圖 */
  photoPreview?: string;
  /** 客人稱呼（可選）—— 預約訊息會帶埋 */
  customerName?: string;
  /** 客人電話（ContactCard 必填）—— 預約訊息會帶埋 */
  customerPhone?: string;
  onReset: () => void;
  /** 剔咗懷孕就會硬過濾所有禁忌療程 —— 一個建議都冇嘅時候要講返真正原因 */
  pregnant?: boolean;
}) {
  const { analysis: a } = data;
  const observedKeys = new Set(a.findings.map((f) => f.key));
  const unobservedConcerns = selectedFindings.filter((f) => !observedKeys.has(f));
  const highlights = regionHighlights(a.findings);
  const hasHighlights = Object.values(highlights).some((v) => (v ?? 0) >= 25);

  // 真相版觀察圖：要有相 + 有（消毒過嘅）定位點 + 幾何合格先出；
  // 任何一樣唔齊就靜默用示意圖，唔好同客人講「對唔準」。
  const [photoFailed, setPhotoFailed] = useState(false);
  const [view, setView] = useState<'photo' | 'map'>('photo');
  const canPhoto = !!photoPreview && !!a.landmarks && !photoFailed;
  const showPhoto = canPhoto && view === 'photo';
  const overallVal = highlights.overall_skin ?? 0;
  const recs = data.recommendations.slice(0, TOP_N);
  const top = [...a.findings].sort((x, y) => y.severity - x.severity).slice(0, 4);
  const link = buildReportBookingUrl({
    phone: process.env.NEXT_PUBLIC_WHATSAPP,
    goals,
    findings: top
      .filter((f) => f.key in FINDING_LABELS)
      .map((f) => ({ key: f.key, label: FINDING_LABELS[f.key as FindingKey], severity: f.severity })),
    categories: computeCategoryScores(a.findings)
      .filter((c) => c.band === 'improvable' || c.band === 'attention')
      .sort((x, y) => x.score - y.score)
      .map((c) => ({ label: c.label, score: c.score })),
    treatments: recs.map((r) => r.treatment.name),
    customerName,
    customerPhone,
    recordSaved: Boolean(data.record?.saved && data.record.persistent),
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

      {/* 面部觀察圖：成份報告嘅「一眼版」。放喺質素警示之後、分數之前。 */}
      {hasHighlights && (
        <div className="card">
          <h2>面部觀察圖</h2>
          {canPhoto && (
            <div className="fm-toggle" role="group" aria-label="切換觀察圖顯示方式">
              <button type="button" aria-pressed={view === 'photo'} onClick={() => setView('photo')}>
                你嘅相片
              </button>
              <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>
                示意圖
              </button>
            </div>
          )}
          {showPhoto && photoPreview && a.landmarks ? (
            <PhotoFaceMap
              preview={photoPreview}
              landmarks={a.landmarks}
              highlights={highlights}
              onFallback={() => setPhotoFailed(true)}
            />
          ) : (
            <FaceMap mode="display" highlights={highlights} />
          )}
          <div className="fm-legend" aria-hidden="true">
            {/* 圖例透明度跟當前模式 —— 圖例同幅圖唔一致就係呃人 */}
            <span>
              <i style={{ opacity: showPhoto ? 0.1 : 0.18 }} />
              輕微
            </span>
            <span>
              <i style={{ opacity: showPhoto ? 0.19 : 0.35 }} />
              中度
            </span>
            <span>
              <i style={{ opacity: showPhoto ? 0.3 : 0.55 }} />
              明顯
            </span>
          </div>
          {/* 真相版唔畫全面 wash（似「成塊面有事」）—— overall_skin 用文字交代 */}
          {showPhoto && intensityOfOverall(overallVal) && (
            <p className="fm-caption" style={{ marginTop: 4 }}>
              整體膚質：{overallVal >= 66 ? '明顯' : overallVal >= 41 ? '中度' : '輕微'}（全面性觀察，唔標喺單一位置）
            </p>
          )}
          <p className="fm-caption">
            {showPhoto
              ? '呢張相只會喺你部機顯示，分析完成後唔會上傳或儲存 · 標示係觀察位置，唔係模擬效果 · AI 相片估算，因人而異，並非診斷'
              : '示意圖，唔係你嘅相片 · AI 相片估算，因人而異，並非診斷'}
          </p>
          {unobservedConcerns.length > 0 && (
            <p className="fm-caption" style={{ marginTop: 4 }}>
              你自選嘅
              <b>{unobservedConcerns.map((f) => FINDING_LABELS[f]).join('、')}</b>
              喺呢張相入面觀察唔到明顯跡象 —— 如果你自己覺得有，面診時同醫生講清楚會準確好多。
            </p>
          )}
        </div>
      )}

      {/* 雷達放喺質素警示之後 —— 一份「呢張相唔多好」嘅警告上面
          唔可以擺一個睇落好肯定嘅分數版面 */}
      <CategoryScores findings={a.findings} collapsible />

      <div className="card">
        <h2>我哋睇到咩</h2>
        <ClampText text={a.overallSummary} />
        {top.length > 0 &&
          top.map((f) => {
            const key = f.key as FindingKey;
            const region = key in FINDING_LABELS ? primaryRegionOf(key) : null;
            return (
              <div className="finding" key={f.key}>
                <div className="top">
                  <b>
                    {FINDING_LABELS[key] ?? f.key}
                    {region && <span className="region-tag">{REGION_LABEL[region]}</span>}
                  </b>
                  <em>{f.severity >= 66 ? '明顯' : f.severity >= 41 ? '中度' : '輕微'}</em>
                </div>
                <div className="bar">
                  <i style={{ width: `${f.severity}%` }} />
                </div>
                <ClampText text={f.observation} />
              </div>
            );
          })}
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

        {recs.map((r, i) => {
          const targetHl = regionHighlights(r.targets);
          const showMini = Object.values(targetHl).some((v) => (v ?? 0) >= 25);
          return (
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
              {/* 一眼睇到「呢樣嘢做邊度」—— 合規重點：標示嘅係針對位置，
                  唔係模擬效果 */}
              {showMini && (
                <div className="rec-mini">
                  <FaceMap mode="display" mini highlights={targetHl} />
                  <span>針對位置</span>
                </div>
              )}
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
            <TreatmentTimeline onset={r.treatment.onset} duration={r.treatment.duration} />
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
          );
        })}

        {recs.length > 0 && (
          <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', margin: '10px 0 0' }}>
            效果出現時間因人而異，以醫生面診評估為準。
          </p>
        )}

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

      {/* 分階段路線圖：API 一直有計（打底 → 結構 → 塑形），以前客人版冇顯示。
          有次序嘅方案先係「方案」—— 冇呢張圖，三個療程只係一張購物清單。 */}
      {(data.plan?.length ?? 0) > 1 && (
        <div className="card">
          <h2>建議進行次序</h2>
          <div className="roadmap">
            {data.plan.map((p, i) => (
              <div className="phase" key={p.phase}>
                <div className="rail" aria-hidden="true">
                  <span className="dot">{i + 1}</span>
                  {i < data.plan.length - 1 && <span className="line" />}
                </div>
                <div className="body">
                  <div className="hd">
                    <b>{p.title}</b>
                    <span className="timing">{p.timing}</span>
                  </div>
                  <div className="items">
                    {p.items.map((it) => (
                      <span className="pill" key={it.treatment.id}>
                        {it.treatment.name}
                        <em>{CATEGORY_LABELS[it.treatment.category as TreatmentCategory]}</em>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', margin: '10px 0 0' }}>
            建議次序屬參考，實際安排由醫生按你情況調整。
          </p>
        </div>
      )}

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
          <>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="primary"
              onClick={() => trackStep('booking_clicked')}
              style={{ display: 'block', textDecoration: 'none', marginTop: 0, boxSizing: 'border-box' }}
            >
              📋 傳送報告俾 Dr Timeless 預約
            </a>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', margin: '8px 0 0' }}>
              會開 WhatsApp 並預先填好報告摘要（唔包相片）——你睇晒內容、撳「發送」先算真正送出。
              送出之後，我哋會喺辦公時間內覆你安排時間。
            </p>
          </>
        ) : (
          <div className="alert warn" style={{ textAlign: 'left', marginBottom: 0 }}>
            未設定 <code>NEXT_PUBLIC_WHATSAPP</code>，預約按鈕唔會顯示。喺 <code>.env</code> 填入診所 WhatsApp
            號碼（國際格式，例如 <code>85212345678</code>）後重新 build。
          </div>
        )}
        <button className="ghost" onClick={onReset} style={{ marginTop: 12, width: '100%' }}>
          再分析一次
        </button>
        {typeof data.meta.remainingAnalyses === 'number' && (
          <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', margin: '10px 0 0' }}>
            {data.meta.remainingAnalyses > 0
              ? `你呢個電話仲有 ${data.meta.remainingAnalyses} 次免費分析。`
              : '你嘅免費分析次數已經用晒 —— 想跟進就用上面個掣直接搵我哋啦。'}
          </p>
        )}
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
