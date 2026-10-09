'use client';

import { useState } from 'react';

/**
 * 「AI 相片外觀年齡估算」—— 結果頁嘅自願對比卡。
 *
 * ⚠️ 功能開關：server flag（AGE_ESTIMATE_ENABLED）冇開嗰陣 meta 根本
 *    冇 ageEstimate 呢個欄，呢張卡唔會 render。公開啟用前必須完成
 *    docs/age-estimate-validation.md 嘅驗證。
 *
 * 誠實規則（產品要求，唔好喺呢度「優化」文案）：
 * - 名稱只可以係「相片外觀年齡估算」—— 唔係皮膚年齡、生理年齡、
 *   衰老程度、健康年齡。呢啲一張自拍判斷唔到。
 * - 客人自願填實際歲數（可以跳過）；估齡嗰刻模型唔知佢填咗咩
 *   （server 保證：AGE_ESTIMATE_ENABLED 開咗就唔會將年齡送入 prompt）。
 * - 真實年齡落喺範圍內 → 講「相符」，唔准揀最高嗰個數嚟製造差距。
 * - 估算大過實際 ≠ 需要療程；估算細過實際 ≠ 健康證明。
 * - 冇「做完療程年輕 X 歲」呢類句子，永遠唔可以有。
 */

interface Props {
  /** null = 模型冇把握 → 顯示「未能可靠估算」+ 重拍建議 */
  estimate: { rangeMin: number; rangeMax: number; basis: string } | null;
  retakeHints?: string[];
}

export default function AgeEstimateCard({ estimate, retakeHints = [] }: Props) {
  const [ageText, setAgeText] = useState('');
  const [skipped, setSkipped] = useState(false);

  const realAge = /^\d{1,3}$/.test(ageText.trim()) ? Number(ageText.trim()) : null;
  const validAge = realAge !== null && realAge >= 18 && realAge <= 100;

  let comparison: { tone: 'match' | 'younger' | 'older'; text: string } | null = null;
  if (estimate && validAge) {
    if (realAge! >= estimate.rangeMin && realAge! <= estimate.rangeMax) {
      comparison = {
        tone: 'match',
        text: `你填報嘅 ${realAge} 歲落喺估算範圍之內 —— 即係話呢張相睇落同你嘅實際歲數相符。`,
      };
    } else if (realAge! > estimate.rangeMax) {
      comparison = {
        tone: 'younger',
        text: `呢張相睇落比你填報嘅 ${realAge} 歲後生。可能係光線、角度或者保養狀態嘅功勞 —— 相片因素影響好大，唔好當佢係皮膚狀況嘅證明。`,
      };
    } else {
      comparison = {
        tone: 'older',
        text: `呢張相睇落比你填報嘅 ${realAge} 歲大。常見原因係光線（頂光會加深陰影）、角度同表情 —— 唔代表你需要任何療程。想知實際點，素顏自然光重影一次，或者到店做皮膚分析會準好多。`,
      };
    }
  }

  return (
    <div className="card">
      <h2>AI 相片外觀年齡估算</h2>

      {estimate ? (
        <>
          <p style={{ fontSize: '1.05rem', margin: '4px 0 2px' }}>
            呢張相睇落大約 <b style={{ fontSize: '1.3rem' }}>{estimate.rangeMin}–{estimate.rangeMax} 歲</b>
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: '0 0 4px' }}>
            估算依據：{estimate.basis}
          </p>
        </>
      ) : (
        <>
          <p style={{ margin: '4px 0 2px' }}>
            <b>呢張相未能可靠估算外觀年齡。</b>
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', margin: 0 }}>
            光線、角度、妝容或者美顏濾鏡都會令估算唔穩定 —— 與其俾個唔準嘅數你，不如照實講。
            {retakeHints.length > 0 && <> 重拍建議：{retakeHints.slice(0, 2).join('；')}。</>}
          </p>
        </>
      )}

      <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.7, margin: '10px 0' }}>
        呢個係「呢一張相」嘅外觀估算，唔係皮膚年齡、唔係健康指標。光線、角度、表情、妝容、
        美顏同相機質素全部會影響結果；同一個人、同一日、唔同光線可以差好幾歲。
      </p>

      {estimate && !skipped && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
          <p style={{ fontSize: '0.85rem', margin: '0 0 8px' }}>
            <b>想對比一下？</b>填你嘅實際歲數（自願，唔會儲存、唔會傳送去任何地方）：
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="例如 35"
              value={ageText}
              onChange={(e) => setAgeText(e.target.value)}
              style={{ maxWidth: 120 }}
              aria-label="實際歲數（自願）"
            />
            <span style={{ fontSize: '0.85rem' }}>歲</span>
            <button
              type="button"
              className="ghost"
              style={{ marginLeft: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}
              onClick={() => setSkipped(true)}
            >
              跳過
            </button>
          </div>
          {ageText.trim() !== '' && !validAge && (
            <p style={{ color: 'var(--danger)', fontSize: '0.78rem', margin: '6px 0 0' }}>
              請輸入 18–100 之間嘅歲數（呢個功能只供成年人參考）。
            </p>
          )}
          {comparison && (
            <p
              style={{
                fontSize: '0.88rem',
                lineHeight: 1.7,
                margin: '10px 0 0',
                padding: '10px 12px',
                borderRadius: 8,
                background: comparison.tone === 'older' ? 'var(--warn-soft, #fdf6ec)' : 'var(--accent-soft)',
              }}
            >
              {comparison.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
