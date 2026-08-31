'use client';

/**
 * 兩條相片答唔到、但影響好大嘅問題。
 *
 * MVP 嘅原則係「每加一格輸入就跌一批客人」，所以呢度極度克制：兩行，
 * 全部都係一撳就完，冇一格要打字。加得入嚟嘅理由要好硬 ——
 *
 * ── 年齡：準確度 ──
 * 同一條法令紋，喺 28 歲同 52 歲身上意思完全唔同（前者多數係結構 /
 * 表情紋，後者多數係容積流失）。模型本身就會估年齡，但估錯嘅代價
 * 直接落喺建議上面。客人撳一下就準好多，係最抵嘅一格。
 *
 * ── 懷孕 / 哺乳：安全 ──
 * 呢個唔係準確度問題，係安全問題。激光、射頻、肉毒、填充喺懷孕期
 * 全部屬禁忌。配對引擎本身有硬過濾（isPregnantOrNursing），但
 * **客人版之前根本冇問過**，個 flag 永遠傳唔到入去 —— 即係話一個
 * 懷孕嘅客人會照樣收到一份建議佢打肉毒嘅報告。
 *
 * 過濾之後可能一個建議都唔剩。咁樣係**正確**行為，報告會解釋點解。
 */

const AGES: { key: string; label: string; mid: number }[] = [
  { key: '20s', label: '20–29', mid: 25 },
  { key: '30s', label: '30–39', mid: 35 },
  { key: '40s', label: '40–49', mid: 45 },
  { key: '50s', label: '50–59', mid: 55 },
  { key: '60+', label: '60 以上', mid: 65 },
];

export function ageFromBand(band: string | null): number | undefined {
  return AGES.find((a) => a.key === band)?.mid;
}

export default function QuickFacts({
  ageBand,
  onAge,
  pregnant,
  onPregnant,
}: {
  ageBand: string | null;
  onAge: (b: string | null) => void;
  pregnant: boolean;
  onPregnant: (v: boolean) => void;
}) {
  return (
    <div className="card">
      <h2>4. 兩條快問</h2>
      <p className="sub">相片答唔到，但影響好大。撳一下就得。</p>

      <div className="qf-label">年齡（令建議準啲）</div>
      <div className="qf-chips">
        {AGES.map((a) => (
          <button
            key={a.key}
            type="button"
            className={`qf-chip${ageBand === a.key ? ' on' : ''}`}
            aria-pressed={ageBand === a.key}
            onClick={() => onAge(ageBand === a.key ? null : a.key)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* 呢個唔係「多一個選項」，係安全閘。剔咗會硬過濾所有禁忌療程。 */}
      <label className="qf-check">
        <input type="checkbox" checked={pregnant} onChange={(e) => onPregnant(e.target.checked)} />
        <span>
          <b>我而家懷孕或者餵緊人奶</b>
          <em>
            激光、射頻、肉毒、填充喺呢段時間全部唔適合。剔咗之後系統會自動剔走所有相關療程 ——
            有機會一個建議都唔剩，咁樣係正常嘅。
          </em>
        </span>
      </label>
    </div>
  );
}
