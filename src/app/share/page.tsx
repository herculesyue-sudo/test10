'use client';

/**
 * 派俾客人嘅方法 —— 唔使掂官網。
 *
 * 一個部署咗但冇人搵到嘅工具等於冇做過。診所唔改官網嘅話，實際上得
 * 三條路：診所現場掃 QR、WhatsApp / IG 派連結、社交平台帖文。
 * 呢版就係將呢三樣變成「撳一下就用得」。
 *
 * 文案直接寫死喺呢度而唔係叫診所自己諗 —— 叫一間診所「自己寫段
 * 宣傳文字」，個結果通常係永遠都唔會發出去。
 */

import { useEffect, useState } from 'react';

function CopyBox({ label, text, hint }: { label: string; text: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <b style={{ fontSize: '0.88rem' }}>{label}</b>
        <button
          className="ghost"
          style={{ padding: '3px 10px', fontSize: '0.74rem', width: 'auto', marginTop: 0 }}
          onClick={() => {
            navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            });
          }}
        >
          {copied ? '✓ 已複製' : '複製'}
        </button>
      </div>
      <div
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 9,
          padding: '10px 12px',
          fontSize: '0.83rem',
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
        }}
      >
        {text}
      </div>
      {hint && (
        <p style={{ fontSize: '0.76rem', color: 'var(--text-dim)', margin: '5px 0 0' }}>{hint}</p>
      )}
    </div>
  );
}

interface SiteInfo {
  url: string;
  source: 'env' | 'host';
  reachability: 'public' | 'lan' | 'local';
  printable: boolean;
  warning?: string;
  target: string;
}

export default function SharePage() {
  const [site, setSite] = useState<SiteInfo | null>(null);

  // 個網址一定要問返伺服器，唔可以用 window.location.origin —— 兩者可以唔同
  // （例如設咗 NEXT_PUBLIC_SITE_URL，或者經 proxy 開），而 QR 用嘅係伺服器
  // 嗰個。攞錯咗就會出現「頁面寫住 A，但個 QR 其實指住 B」。
  useEffect(() => {
    fetch('/api/qr?path=/&info=1')
      .then((r) => r.json())
      .then(setSite)
      .catch(() => {});
  }, []);

  const clinic = process.env.NEXT_PUBLIC_CLINIC_NAME || 'Dr Timeless';
  const link = site?.url || '（載入中…）';
  const printable = site?.printable === true;

  const waText = `想知自己塊面適合咩療程？\n\n${clinic} 出咗個免費 AI 面部分析：自拍一張相，30 秒睇到針對你嘅療程方向。唔使留電話、唔使登記。\n\n${link}\n\n（結果屬初步參考，正式評估仍需醫生面診）`;

  const igText = `免費 AI 面部分析 ✨\n自拍一張相 → 30 秒睇到適合你嘅療程方向\n唔使留電話、唔使登記\n\n連結喺 profile 度 👆\n\n#香港醫美 #皮膚分析 #${clinic.replace(/\s+/g, '')}`;

  return (
    <div className="wrap">
      <header className="site no-print">
        <h1>派俾客人</h1>
        <p>唔使改官網，三個方法即刻用得</p>
      </header>

      {/* 個 QR 指住一個手機去唔到嘅網址，係最貴嘅錯 —— 你可能已經印咗
          一百張先發現。所以寧願喺呢度嘈，都唔好俾佢靜靜雞印出去。 */}
      {site && !printable && (
        <div className="alert danger no-print">
          <b>⚠️ 而家唔可以印海報</b>
          <p style={{ margin: '6px 0 0', fontSize: '0.86rem' }}>{site.warning}</p>
          <p style={{ margin: '8px 0 0', fontSize: '0.86rem' }}>
            個 QR 而家指住：<code>{site.target || '（算唔到）'}</code>
          </p>
          {site.reachability === 'local' && (
            <p style={{ margin: '8px 0 0', fontSize: '0.86rem' }}>
              想喺本機用手機試：<code>npm run dev -- -H 0.0.0.0</code>，再用同一個 Wi-Fi
              嘅手機開 <code>http://&lt;你部電腦 IP&gt;:3000/share</code>。
              （iOS 要 HTTPS 先開到相機，所以正式測試最好直接部署 —— 見 DEPLOY.md）
            </p>
          )}
        </div>
      )}

      {/* ── 印海報 ── */}
      <div className="card poster">
        <h2 className="no-print">1. 診所現場擺 QR</h2>
        <p className="sub no-print">
          撳下面個掣印出嚟，擺喺接待處 / 等候區 / 診症室。客人一路等一路掃，
          做完分析就已經帶住問題入去見醫生 —— 面診嘅質素高好多。
        </p>

        <div className="poster-sheet">
          <div className="poster-clinic">{clinic}</div>
          <div className="poster-title">
            免費 AI
            <br />
            面部分析
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="poster-qr" src="/api/qr?path=/" alt="掃描做免費 AI 面部分析" />
          <div className="poster-steps">
            用手機相機掃一掃
            <br />
            自拍一張相 · 30 秒出結果
          </div>
          <div className="poster-url">{link}</div>
          <div className="poster-fine">
            結果屬初步參考，並非醫學診斷。注射及高能量儀器療程須由註冊醫生評估及施行。
          </div>
        </div>

        <button
          className="primary no-print"
          onClick={() => window.print()}
          disabled={!printable}
          style={{ marginTop: 14 }}
        >
          {printable ? '🖨 列印海報' : '⚠️ 個網址而家掃唔到，唔可以印'}
        </button>
        <p className="sub no-print" style={{ marginBottom: 0, marginTop: 8 }}>
          {printable
            ? 'A4 直度、彩色或黑白都掃得到。QR 用 SVG，放到幾大都唔會矇。'
            : '放上網並設定 NEXT_PUBLIC_SITE_URL 之後，呢個掣就會開返。'}
        </p>
      </div>

      {/* ── WhatsApp / IG ── */}
      <div className="card no-print">
        <h2>2. WhatsApp 派俾客人</h2>
        <p className="sub">
          最有用嘅時機唔係新客，係<b>舊客跟進</b>：做完療程一個月，send 呢個俾佢，
          佢自己會發現下一個想改善嘅地方。
        </p>
        <CopyBox label="訊息內容" text={waText} />
        <CopyBox label="淨係要連結" text={link} hint="想自己寫文案就用呢個。" />
      </div>

      <div className="card no-print">
        <h2>3. IG / 小紅書帖文</h2>
        <p className="sub">連結擺喺 profile（IG 內文按唔到），帖文引導佢撳 bio。</p>
        <CopyBox label="貼文文字" text={igText} />
      </div>

      <div className="card no-print">
        <h2>擺之前檢查</h2>
        <ul style={{ fontSize: '0.86rem', lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
          <li>
            <b>用手機掃一次上面個 QR</b>，確認真係開到 —— 呢個係最容易出錯嘅一步。
            開到之後行完成個流程：影相、出報告、撳預約掣，確認 WhatsApp
            真係開到你哋個號碼
          </li>
          <li>
            確認網址係 <code>https://</code> —— 唔係嘅話手機唔會俾開鏡頭，客人影唔到相
          </li>
          <li>
            確認唔係測試模式（報告上面冇 🧪 橫額）—— 有嘅話客人見到嘅係假數據
          </li>
        </ul>
      </div>
    </div>
  );
}
