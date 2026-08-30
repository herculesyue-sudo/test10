'use client';

/**
 * 嵌入說明頁。
 *
 * 點解要一版嘢淨係講「copy 兩行字」：因為診所唔會記得個網址、唔會知
 * 要開邊個環境變數、亦唔會知點解貼咗之後乜都冇出現。呢版會用**實際
 * 部署緊嘅網址**產生程式碼，並即場檢查允許清單有冇設 —— 唔使問人。
 */

import { useEffect, useState } from 'react';

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ position: 'relative', marginBottom: 14 }}>
      <pre
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '14px 14px',
          overflowX: 'auto',
          fontSize: '0.8rem',
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {children}
      </pre>
      <button
        className="ghost"
        style={{ position: 'absolute', top: 8, right: 8, padding: '4px 10px', fontSize: '0.75rem', width: 'auto' }}
        onClick={() => {
          navigator.clipboard.writeText(children).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
      >
        {copied ? '✓ 已複製' : '複製'}
      </button>
    </div>
  );
}

export default function SetupPage() {
  const [origin, setOrigin] = useState('');
  const [status, setStatus] = useState<{ configured: boolean; origins: string[] } | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch('/api/embed-status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  const snippet = `<div id="drt-consult"></div>\n<script src="${origin}/embed.js" async></script>`;

  return (
    <div className="wrap">
      <header className="site">
        <h1>放上官網</h1>
        <p>將 AI 面部分析嵌入 drtimeless.com</p>
      </header>

      <div className="card">
        <h2>要貼嘅嘢</h2>
        <p className="sub">
          喺官網想擺個工具嗰個位置，貼呢兩行。WordPress、Wix、Squarespace、Webflow
          都得 —— 任何俾你插 HTML 嘅地方都用得。
        </p>
        <Code>{snippet}</Code>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', margin: 0 }}>
          個 <code>div</code> 一定要喺 <code>script</code> <b>之前</b>，否則腳本搵唔到擺喺邊。
        </p>
      </div>

      <div className="card">
        <h2>一個一定要做嘅設定</h2>
        {status === null ? (
          <p className="sub">檢查緊…</p>
        ) : status.configured ? (
          <>
            <div className="alert" style={{ background: 'var(--accent-soft)', marginTop: 0 }}>
              ✓ 已設定。以下網域可以嵌入：
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {status.origins.map((o) => (
                  <li key={o}>
                    <code>{o}</code>
                  </li>
                ))}
              </ul>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', margin: 0 }}>
              如果官網有 www 同冇 www 兩個版本，兩個都要列 —— 瀏覽器當佢哋係兩個唔同網域。
            </p>
          </>
        ) : (
          <>
            <div className="alert danger" style={{ marginTop: 0 }}>
              <b>⚠️ 未設定 EMBED_ALLOWED_ORIGINS —— 而家貼上官網會顯示唔到。</b>
            </div>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.7 }}>
              Cloudflare 部署：加入 <code>wrangler.jsonc</code> 嘅 <code>vars</code>{' '}
              再重新部署（見 DEPLOY.md）。其他平台就加環境變數：
            </p>
            <Code>{`EMBED_ALLOWED_ORIGINS=https://www.drtimeless.com,https://drtimeless.com`}</Code>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', margin: 0 }}>
              加完要重新部署先生效。<b>預設係唔准任何外部網站嵌入</b> —— 因為容許
              全世界嵌入即係任何人（包括同行）都可以將你個工具擺上佢個網站，用你嘅
              API 額度做佢哋生意，而你唯一嘅線索係月尾張帳單。
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h2>貼之前要知</h2>
        <ul style={{ fontSize: '0.87rem', lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
          <li>
            <b>高度自動調校。</b>唔使自己度尺寸，個 widget 會主動報高度俾官網。
            想改最低高度就寫 <code>&lt;div id=&quot;drt-consult&quot; data-min-height=&quot;700&quot;&gt;</code>。
          </li>
          <li>
            <b>相機有三個前提。</b>①官網要行 https；②段 code 要<b>直接貼落頁面</b>，
            唔可以俾平台再包一層自己嘅 iframe（例如 Wix 嘅「嵌入 HTML」）——
            相機權限要一層一層傳落嚟，斷咗一層就開唔到，個 widget 甚至可能成個唔顯示；
            ③官網唔可以送 <code>Permissions-Policy: camera=()</code> 呢類封鎖 header
            （有啲 security plugin 會靜靜加）。就算頁面內相機開唔到，客人都仲可以撳掣
            用系統選擇器揀相簿相或者影相 —— 工具照用得。
          </li>
          <li>
            <b>相片唔會經你個官網。</b>客人張相由 widget 直接送去分析，唔會存落任何伺服器，
            亦唔會經官網個 server —— 咁樣官網本身唔會變成要處理個人資料嘅系統。
          </li>
          <li>
            <b>建議擺喺邊。</b>放喺「療程」頁同「關於我們」之間效果最好 —— 客人啱啱睇完
            你哋做咩，未決定信唔信，呢個時候俾佢一個免費、即時、唔使留電話嘅嘢試，
            係最自然嘅下一步。
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>試一試</h2>
        <p className="sub">開新分頁睇下嵌入版實際係點：</p>
        <a
          href="/embed"
          target="_blank"
          rel="noopener noreferrer"
          className="primary"
          style={{ display: 'block', textDecoration: 'none', boxSizing: 'border-box' }}
        >
          預覽嵌入版
        </a>
      </div>
    </div>
  );
}
