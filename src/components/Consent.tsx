'use client';

import { useState } from 'react';
import { CLINIC_POLICY } from '@/lib/treatments/clinic';

/**
 * 相片使用同意。
 *
 * 客人嘅面部相片喺香港《個人資料（私隱）條例》下屬個人資料，而且會傳送去
 * 第三方（Google Vertex AI，可能喺香港境外）處理。要事先講明用途、接收方、保留期，
 * 並取得明確同意 —— 一個預設剔咗嘅 checkbox 唔算明確同意，所以呢度預設係空。
 *
 * ⚠️ 呢段文字係按系統實際行為寫（相片即時轉發、唔寫入磁碟、唔入資料庫）。
 *    「唔會用嚟訓練」嗰句有官方依據：Google Cloud Service Specific Terms
 *    第 17 條（Training Restriction）寫明未經許可唔會用客戶資料訓練模型
 *    （查證日期 2026-10，見 docs/age-estimate-validation.md 嘅參考）。
 *    呢啲聲稱刻意只講**相片** —— 分析摘要儲存係另一份獨立自願同意
 *    （結果頁嘅 SaveReportCard.tsx），儲嘅只係分數數字，相片依然一律唔儲。
 *    如果日後真係要儲相（例如前後對比相），呢段一定要改，
 *    否則就變成同客人講咗一件唔真確嘅事。
 *
 * 2026-10 改版：基本分析唔再需要留電話。呢個 checkbox 係分析前唯一嘅閘，
 * 涵蓋嘅只係「相片傳去 AI 服務商做即時分析」一件事。
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
            相片會經加密連線傳送俾 AI 服務供應商 Google（Vertex AI 服務）作即時分析。處理過程可能喺香港境外進行。
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <b style={{ color: 'var(--text)' }}>保留幾耐</b>
            <br />
            {CLINIC_POLICY.name} 唔會將你嘅相片寫入伺服器硬碟，亦唔會存入任何資料庫。
            分析完成之後，相片喺我哋呢邊即時消失。服務供應商（Google）可能為安全同防止濫用
            短暫記錄請求，佢哋自身嘅保留政策由佢哋決定。
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <b style={{ color: 'var(--text)' }}>唔會做嘅嘢</b>
            <br />
            我哋唔會用你嘅相片訓練任何模型、唔會賣俾第三方、唔會喺未經你同意下公開展示。
            Google 作為服務處理方，根據 Google Cloud 服務特定條款，未經許可唔會用客戶資料訓練模型。
          </p>
          <p style={{ margin: 0 }}>
            <b style={{ color: 'var(--text)' }}>你嘅權利</b>
            <br />
            你可以隨時唔用呢個工具而直接聯絡我哋（WhatsApp 6484 3111）。因為我哋唔會保留相片，
            所以冇嘢需要事後刪除；如果你曾經透過 WhatsApp 傳相俾我哋，可以要求刪除該段對話紀錄。
            分析摘要嘅保存同跟進係另一個**獨立**嘅自願同意 —— 睇完報告先決定，唔剔唔影響你而家分析。
          </p>
        </div>
      )}
    </div>
  );
}
