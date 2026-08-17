'use client';

import { useState } from 'react';
import { CLINIC_POLICY } from '@/lib/treatments/clinic';

/**
 * 相片使用同意。
 *
 * 客人嘅面部相片喺香港《個人資料（私隱）條例》下屬個人資料，而且會傳送去
 * 香港境外嘅第三方（Anthropic）處理。要事先講明用途、接收方、保留期，
 * 並取得明確同意 —— 一個預設剔咗嘅 checkbox 唔算明確同意，所以呢度預設係空。
 *
 * ⚠️ 呢段文字係按系統實際行為寫（相片即時轉發、唔寫入磁碟、唔入資料庫）。
 *    如果日後加咗儲存功能（例如療程前後對比），呢段一定要改，
 *    否則就變成同客人講咗一件唔真確嘅事。
 */
export default function Consent({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card" style={{ borderColor: checked ? 'var(--border)' : 'var(--accent)' }}>
      <label className="check" style={{ marginTop: 0, alignItems: 'flex-start' }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>
          我同意將相片傳送俾 AI 服務商作即時分析，並已閱讀下方嘅資料處理說明。
        </span>
      </label>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          padding: '10px 0 0 27px',
          color: 'var(--accent)',
          font: 'inherit',
          fontSize: '0.8rem',
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        {open ? '收起' : '你嘅相片會點樣被處理？'}
      </button>

      {open && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.7, paddingLeft: 27, marginTop: 8 }}>
          <p style={{ margin: '0 0 8px' }}>
            <b style={{ color: 'var(--text)' }}>用途</b>
            <br />
            相片只會用嚟做一次面部影像分析，產生你即時見到嘅報告。
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <b style={{ color: 'var(--text)' }}>會傳去邊</b>
            <br />
            相片會經加密連線傳送俾 AI 服務供應商 Anthropic 處理。呢個處理過程喺香港境外進行。
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <b style={{ color: 'var(--text)' }}>保留幾耐</b>
            <br />
            {CLINIC_POLICY.name} 唔會將你嘅相片寫入伺服器硬碟，亦唔會存入任何資料庫。
            分析完成之後，相片喺我哋呢邊即時消失。服務供應商自身嘅保留政策由佢哋決定。
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <b style={{ color: 'var(--text)' }}>唔會做嘅嘢</b>
            <br />
            唔會用嚟訓練任何模型、唔會賣俾第三方、唔會喺未經你同意下公開展示。
          </p>
          <p style={{ margin: 0 }}>
            <b style={{ color: 'var(--text)' }}>你嘅權利</b>
            <br />
            你可以隨時唔用呢個工具而直接聯絡我哋。因為我哋唔會保留相片，所以冇嘢需要事後刪除；
            如果你曾經透過 WhatsApp 傳相俾我哋，可以要求刪除該段對話紀錄。
          </p>
        </div>
      )}
    </div>
  );
}
