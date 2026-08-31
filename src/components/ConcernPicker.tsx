'use client';

import { useState } from 'react';
import { GOALS, FINDING_LABELS, type FindingKey, type GoalKey } from '@/lib/treatments/types';
import { FACE_REGIONS, REGION_LABEL, type FaceRegionKey } from '@/lib/face-regions';
import FaceMap from './FaceMap';

/**
 * 「你最想改善咩」嘅揀選器。
 *
 * 兩條路：
 *  - 點面圖揀（預設）：撳部位 → 圖下面 inline 展開該區問題 → 剔選。
 *    ⚠️ 一定係 inline 展開，唔好用 position:fixed bottom sheet ——
 *    embed iframe 嘅高度就係內容高度，fixed 會飛出可視範圍；
 *    inline 增長先係 embed-client ResizeObserver 處理到嘅（會縮返）。
 *  - 揀改善目標（後備）：原有 10 個目標掣，一按一個方向。
 *
 * 兩條路嘅選擇互相獨立（都會入分析），已揀嘅問題以可移除 chip 展示。
 */
export default function ConcernPicker({
  selected,
  onChange,
  goals,
  onGoals,
}: {
  selected: FindingKey[];
  onChange: (f: FindingKey[]) => void;
  goals: GoalKey[];
  onGoals: (g: GoalKey[]) => void;
}) {
  const [tab, setTab] = useState<'map' | 'goals'>('map');
  const [activeRegion, setActiveRegion] = useState<FaceRegionKey | null>(null);

  const counts: Partial<Record<FaceRegionKey, number>> = {};
  for (const r of FACE_REGIONS) {
    const n = r.findings.filter((f) => selected.includes(f)).length;
    if (n > 0) counts[r.key] = n;
  }

  const region = activeRegion ? FACE_REGIONS.find((r) => r.key === activeRegion) : null;

  function toggleFinding(f: FindingKey) {
    onChange(selected.includes(f) ? selected.filter((x) => x !== f) : [...selected, f]);
  }
  function toggleGoal(g: GoalKey) {
    onGoals(goals.includes(g) ? goals.filter((x) => x !== g) : [...goals, g]);
  }

  return (
    <>
      <div className="seg-tabs" role="tablist" aria-label="揀選方式">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'map'}
          className={tab === 'map' ? 'on' : ''}
          onClick={() => setTab('map')}
        >
          點面圖揀
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'goals'}
          className={tab === 'goals' ? 'on' : ''}
          onClick={() => setTab('goals')}
        >
          揀改善目標
        </button>
      </div>

      {tab === 'map' ? (
        <>
          <p className="sub" style={{ margin: '10px 0 4px' }}>
            撳你關注嘅部位，再剔選具體問題（可以揀多過一個部位）。
          </p>
          <FaceMap
            mode="picker"
            counts={counts}
            activeRegion={activeRegion}
            onRegionTap={(r) => setActiveRegion((p) => (p === r ? null : r))}
          />
          <button
            type="button"
            className={`chip overall${activeRegion === 'overall_skin' ? ' on' : ''}${
              (counts.overall_skin ?? 0) > 0 ? ' has' : ''
            }`}
            onClick={() => setActiveRegion((p) => (p === 'overall_skin' ? null : 'overall_skin'))}
          >
            🧴 整體膚質（膚色、毛孔、水潤…）
            {(counts.overall_skin ?? 0) > 0 && <b className="n">{counts.overall_skin}</b>}
          </button>

          {region && (
            <div className="concern-panel" role="group" aria-label={`${region.label}嘅問題選項`}>
              <div className="hd">
                <b>{region.label}</b>
                <button type="button" className="done" onClick={() => setActiveRegion(null)}>
                  完成 ✓
                </button>
              </div>
              <div className="opts">
                {region.findings.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`opt${selected.includes(f) ? ' on' : ''}`}
                    aria-pressed={selected.includes(f)}
                    onClick={() => toggleFinding(f)}
                  >
                    {FINDING_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="sub" style={{ margin: '10px 0 4px' }}>
            可以揀多過一項。
          </p>
          <div className="goals">
            {GOALS.map((g) => (
              <button
                key={g.key}
                type="button"
                className={`goal${goals.includes(g.key) ? ' on' : ''}`}
                onClick={() => toggleGoal(g.key)}
              >
                <b>{g.label}</b>
                <span>{g.desc}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {selected.length > 0 && (
        <div className="chips-removable" aria-label="已揀嘅問題">
          {selected.map((f) => (
            <button key={f} type="button" onClick={() => toggleFinding(f)} aria-label={`移除${FINDING_LABELS[f]}`}>
              {FINDING_LABELS[f]} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export { REGION_LABEL };
