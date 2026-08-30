'use client';

import { computeCategoryScores } from '@/lib/categories';

/**
 * 「8 大範疇評分」—— 報告最頂嗰塊雷達圖 + 分數列。
 *
 * 分數喺前端由 findings 即場計（純函數），唔係 API 另外俾 ——
 * 所以永遠唔會同下面嘅詳細觀察自相矛盾，亦唔使改 API 形狀。
 *
 * 雷達圖用 inline SVG 手畫（本 project 慣例：唔引圖表庫）。
 * 八條軸次序固定，對比先有意義。
 */

/** 由中心 (110,110) 向外，半徑 r，第 i 條軸（12 點鐘起順時針）嘅座標 */
function vertex(i: number, r: number): [number, number] {
  const angle = (Math.PI * 2 * i) / 8 - Math.PI / 2;
  return [110 + r * Math.cos(angle), 110 + r * Math.sin(angle)];
}

const ring = (r: number) =>
  Array.from({ length: 8 }, (_, i) => vertex(i, r).map((n) => n.toFixed(1)).join(',')).join(' ');

export default function CategoryScores({
  findings,
  compact = false,
}: {
  findings: { key: string; severity: number; confidence: number }[];
  /** /records 嘅逐次卡用：唔出雷達，淨係 8 條分數列 */
  compact?: boolean;
}) {
  const scores = computeCategoryScores(findings);
  const poly = scores.map((s, i) => vertex(i, (s.score / 100) * 86).map((n) => n.toFixed(1)).join(',')).join(' ');
  const anyLow = scores.some((s) => s.lowConfidence);

  const rows = (
    <div>
      {scores.map((s) => (
        <div className="finding" key={s.key}>
          <div className="top">
            <b>{s.label}</b>
            <em>
              {s.score}/100 · {s.bandLabel}
              {s.lowConfidence && '（相片因素，參考價值有限）'}
            </em>
          </div>
          <div className="bar">
            <i style={{ width: `${s.score}%`, opacity: s.lowConfidence ? 0.45 : 1 }} />
          </div>
        </div>
      ))}
    </div>
  );

  if (compact) return rows;

  return (
    <div className="card">
      <h2>8 大範疇評分</h2>
      <p className="sub">
        由相片觀察歸納做 8 個範疇，分數越高代表相中狀況越好。AI 相片估算，僅供參考，並非醫學診斷。
      </p>
      <svg className="radar" viewBox="0 0 220 220" role="img" aria-label="8 大範疇評分雷達圖">
        {[25, 50, 75, 100].map((p) => (
          <polygon key={p} points={ring((p / 100) * 86)} fill="none" stroke="var(--border)" strokeWidth="1" />
        ))}
        {scores.map((_, i) => {
          const [x, y] = vertex(i, 86);
          return <line key={i} x1="110" y1="110" x2={x} y2={y} stroke="var(--border)" strokeWidth="0.5" />;
        })}
        <polygon points={poly} fill="var(--accent)" fillOpacity="0.18" stroke="var(--accent)" strokeWidth="1.5" />
        {scores.map((s, i) => {
          const [x, y] = vertex(i, (s.score / 100) * 86);
          return <circle key={s.key} cx={x} cy={y} r="2.4" fill="var(--accent)" />;
        })}
        {scores.map((s, i) => {
          const [x, y] = vertex(i, 101);
          return (
            <text
              key={s.key}
              x={x}
              y={y}
              fontSize="8.5"
              fill="var(--text-dim)"
              textAnchor={x < 100 ? 'end' : x > 120 ? 'start' : 'middle'}
              dominantBaseline={y < 100 ? 'auto' : y > 120 ? 'hanging' : 'middle'}
            >
              {s.label}
            </text>
          );
        })}
      </svg>
      {rows}
      {anyLow && (
        <p style={{ fontSize: '0.76rem', color: 'var(--text-dim)', margin: '10px 0 0' }}>
          有範疇因為光線 / 化妝等相片因素，信心較低 —— 呢啲分數面診時再確認會準確好多。
        </p>
      )}
    </div>
  );
}
