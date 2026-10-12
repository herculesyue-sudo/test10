'use client';

import { REGION_LABEL, type FaceRegionKey } from '@/lib/face-regions';
import {
  OUTLINE_PATHS,
  REGION_SHAPES,
  REGION_DRAW_ORDER,
  FACE_WASH_PATH,
} from './face-map-paths';

/**
 * 面部示意圖 —— 全 app 共用嘅一個 SVG。
 *
 * 兩個模式：
 *  - picker：客人撳區揀問題（每區有已揀數量 badge）
 *  - display：報告上唯讀高亮（透明度按嚴重程度分三級；mini 版俾療程卡用）
 *
 * 色永遠用 --accent（唔用紅／danger 色），字眼只用 輕微/中度/明顯 ——
 * 呢啲係合規決定（見 categories.ts band 註解），唔好改。
 */

/** severity → 高亮透明度。<25 唔畫（同 MIN_PRESENTABLE 一致嘅精神：太輕微唔好標）。 */
export function intensityOf(severity: number): number {
  if (severity >= 66) return 0.55;
  if (severity >= 41) return 0.35;
  if (severity >= 25) return 0.18;
  return 0;
}

type PickerProps = {
  mode: 'picker';
  counts: Partial<Record<FaceRegionKey, number>>;
  activeRegion: FaceRegionKey | null;
  onRegionTap: (r: FaceRegionKey) => void;
};

type DisplayProps = {
  mode: 'display';
  /** 每區 0–100（通常取該區最高 severity）；<25 唔會畫 */
  highlights: Partial<Record<FaceRegionKey, number>>;
  /** ~120px 唯讀迷你版，俾療程卡用 */
  mini?: boolean;
};

export default function FaceMap(props: PickerProps | DisplayProps) {
  const mini = props.mode === 'display' && props.mini;

  const overallVal =
    props.mode === 'display' ? (props.highlights.overall_skin ?? 0) : 0;

  return (
    <svg
      className={`facemap${mini ? ' mini' : ''}`}
      viewBox="0 0 200 260"
      role={props.mode === 'picker' ? 'group' : 'img'}
      aria-label={
        props.mode === 'picker'
          ? '面部區域圖（示意圖）：撳一個部位揀你關注嘅問題'
          : '面部觀察示意圖'
      }
    >
      {/* display 模式：整體膚質 → 全面淡色 wash（畫喺輪廓下面） */}
      {props.mode === 'display' && intensityOf(overallVal) > 0 && (
        <path d={FACE_WASH_PATH} fill="var(--accent)" fillOpacity={intensityOf(overallVal) * 0.25} stroke="none" />
      )}

      {/* 高亮 / 可點按區（輪廓之下，等線稿永遠清晰） */}
      {REGION_DRAW_ORDER.map((key) => {
        const shape = REGION_SHAPES[key];
        if (props.mode === 'display') {
          const op = intensityOf(props.highlights[key] ?? 0);
          if (op === 0) return null;
          return (
            <g key={key}>
              {shape.shapes.map((d, i) => (
                <path key={i} d={d} fill="var(--accent)" fillOpacity={op} stroke="none" />
              ))}
            </g>
          );
        }

        const count = props.counts[key] ?? 0;
        const active = props.activeRegion === key;
        const label = `${REGION_LABEL[key]}${count > 0 ? `，已揀 ${count} 項` : ''}`;
        const tap = () => props.onRegionTap(key);
        return (
          <g
            key={key}
            className={`region${active ? ' active' : ''}${count > 0 ? ' has' : ''}`}
            role="button"
            tabIndex={0}
            aria-pressed={active}
            aria-label={label}
            onClick={tap}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                tap();
              }
            }}
          >
            {shape.shapes.map((d, i) => (
              <path key={i} d={d} className="zone" />
            ))}
            {/* 透明放大 hit 區：確保細區都有 ≥44px 觸控目標 */}
            {(shape.hitShapes ?? []).map((d, i) => (
              <path key={`h${i}`} d={d} fill="transparent" stroke="none" style={{ pointerEvents: 'all' }} />
            ))}
            {count > 0 && (
              <g className="badge" aria-hidden="true">
                <circle cx={shape.badge[0]} cy={shape.badge[1]} r="7.5" />
                <text x={shape.badge[0]} y={shape.badge[1]}>
                  {count}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* 線稿輪廓（最上層） */}
      {OUTLINE_PATHS.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="var(--text-dim)"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.75"
          style={{ pointerEvents: 'none' }}
        />
      ))}
    </svg>
  );
}
