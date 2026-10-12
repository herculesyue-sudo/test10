'use client';

/**
 * 影相之前嘅指引。
 *
 * 呢個係整個系統入面**每蚊回報最高**嘅準確度改善：成本零，但直接改善
 * 送入模型嘅輸入質素。
 *
 * 一張化咗妝、背光、失焦嘅相，用最貴嘅模型都救唔返 —— 佢只會用更高級
 * 嘅推理去分析同一堆睇唔到嘅像素。相反，一張素顏、自然光、對正鏡頭嘅相，
 * 最平嗰個模型都捉到明顯嘅色斑同法令紋。
 *
 * 所以：輸入質素嘅影響大過模型級別，而輸入質素係免費改善嘅。
 *
 * 摺埋咗預設只顯示四個重點 —— 太長冇人睇，等於冇寫。
 */

import { useState } from 'react';

const DO = [
  ['素顏', '粉底遮住色斑同泛紅，係最影響準確度嘅一樣'],
  ['自然光', '企喺窗邊，光線由前面嚟'],
  ['對正鏡頭', '手機平放喺眼睛高度，唔好由下向上'],
  ['唔好笑', '笑會拉平法令紋同眼周紋，睇唔到真實狀態'],
];

const DONT = [
  ['背光', '窗喺你背後 → 塊面變黑，乜都睇唔到'],
  ['頭頂射燈', '會造出假嘅陰影，睇落似中面部凹陷'],
  ['戴眼鏡 / 瀏海遮額', '遮住眼周同抬頭紋'],
  ['美顏濾鏡', '磨皮之後毛孔同膚質完全失真'],
];

export default function CaptureGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="guide">
      <div className="guide-row">
        {DO.map(([k]) => (
          <span className="chip" key={k}>
            {k}
          </span>
        ))}
      </div>
      <button type="button" className="guide-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? '收埋' : '點影先最準？'}
      </button>

      {open && (
        <div className="guide-detail">
          <p className="guide-lead">
            相片質素嘅影響大過用邊個 AI 模型。一張影得好嘅相，分析準確度會高好多 ——
            呢一步唔使錢，但對結果嘅影響好大。
          </p>
          <div className="guide-cols">
            <div>
              <h4 className="yes">要咁做</h4>
              <ul>
                {DO.map(([k, v]) => (
                  <li key={k}>
                    <b>{k}</b>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="no">唔好咁做</h4>
              <ul>
                {DONT.map(([k, v]) => (
                  <li key={k}>
                    <b>{k}</b>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
