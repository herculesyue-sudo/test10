'use client';

import { useEffect, useState } from 'react';

/**
 * 分析等待卡 —— 20–60 秒嘅空窗期以前只係一個灰咗嘅掣。
 *
 * 步驟鏡射真實 pipeline（上載 → 質素檢查 → 觀察 → 配對），用本地
 * timer 推進；**最尾一步會一直轉到真回應返嚟為止** —— 絕唔虛報
 * 一個未發生嘅「完成」。
 *
 * 呢 20–60 秒係全流程唯一嘅 captive moment —— 客人邊度都唔去得，
 * 所以用嚟預告報告有咩睇（輪播）＋顯示佢自己張相，令等待變成期待。
 */
const STEPS = [
  { at: 0, label: '相片上載' },
  { at: 2, label: '影像質素檢查' },
  { at: 8, label: '逐項觀察膚況' },
  { at: 18, label: '配對療程方向' },
];

const HOOKS = [
  'AI 檢查緊 8 大範疇：膚色均勻、毛孔、細紋、輪廓…',
  '完成後，觀察位置會直接標返喺你張相上面',
  '睇完報告，一撳就可以將摘要 WhatsApp 俾我哋跟進',
];

export default function AnalysisProgress({
  demo = false,
  photoPreview,
}: {
  demo?: boolean;
  /** 客人自己張相（本機 preview URL）—— 等佢知道 AI 分析緊「佢嗰張」 */
  photoPreview?: string;
}) {
  const [sec, setSec] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const current = STEPS.reduce((acc, s, i) => (sec >= s.at ? i : acc), 0);
  const hook = HOOKS[Math.floor(sec / 8) % HOOKS.length];

  return (
    <div className="card progress-card" role="status" aria-live="polite">
      {photoPreview && (
        <img
          src={photoPreview}
          alt=""
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
            margin: '0 auto 10px',
            border: '2px solid var(--accent)',
          }}
        />
      )}
      <h2>{demo ? '產生示範結果…' : '分析緊你嘅相片…'}</h2>
      <div className="progress-steps">
        {STEPS.map((s, i) => (
          <div key={s.label} className={`step${i < current ? ' done' : i === current ? ' now' : ''}`}>
            <span className="dot" aria-hidden="true">
              {i < current ? '✓' : ''}
            </span>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      {!demo && (
        <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: '0.84rem' }}>{hook}</p>
      )}
      <p className="sub" style={{ margin: '8px 0 0', textAlign: 'center' }}>
        一般唔使 1 分鐘，唔好離開呢一頁。
      </p>
    </div>
  );
}
