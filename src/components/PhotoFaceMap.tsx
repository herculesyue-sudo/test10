'use client';

import { useState } from 'react';
import type { FaceLandmarks } from '@/lib/schema';
import { computeAlignment, type AlignMatrix } from '@/lib/face-align';
import { intensityOf } from './FaceMap';
import { REGION_SHAPES, REGION_DRAW_ORDER } from './face-map-paths';
import type { FaceRegionKey } from '@/lib/face-regions';

/**
 * 真相版面部觀察圖：客人自己張相 + 對齊咗嘅高亮層。
 *
 * 私隱前提：張相（dataURL）一直只喺客人部機嘅頁面狀態入面 ——
 * 呢度係「顯示返出嚟」，唔係上傳、唔係儲存；refresh 就冇咗。
 *
 * 只畫 REGION_SHAPES 高亮：
 *  - 唔畫 OUTLINE_PATHS —— 真面上畫線稿似戴咗個面具
 *  - 唔畫 FACE_WASH —— 成塊面染色似「全面有事」；overall_skin 由
 *    MvpResult 用文字交代
 * 高亮用 fill（薄）+ stroke（定寬）—— 真皮膚上淨 fill 會似病灶。
 *
 * 幾何唔合格（computeAlignment 回 null）→ 叫 onFallback，等 MvpResult
 * 靜默轉返示意圖。唔好出任何錯誤字句。
 */
export default function PhotoFaceMap({
  preview,
  landmarks,
  highlights,
  onFallback,
}: {
  preview: string;
  landmarks: FaceLandmarks;
  highlights: Partial<Record<FaceRegionKey, number>>;
  onFallback: () => void;
}) {
  const [state, setState] = useState<{ matrix: AlignMatrix; w: number; h: number } | null>(null);

  return (
    <div className="pfm">
      {/* eslint-disable-next-line @next/next/no-img-element -- dataURL，next/image 冇用武之地 */}
      <img
        src={preview}
        alt="你上載嘅相片（只喺你部機顯示）"
        onLoad={(e) => {
          const img = e.currentTarget;
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          const matrix = computeAlignment(landmarks, w, h);
          if (matrix) setState({ matrix, w, h });
          else onFallback();
        }}
      />
      {state && (
        <svg
          className="pfm-overlay"
          viewBox={`0 0 ${state.w} ${state.h}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <g transform={`matrix(${state.matrix.join(' ')})`}>
            {REGION_DRAW_ORDER.map((key) => {
              const op = intensityOf(highlights[key] ?? 0);
              if (op === 0) return null;
              return (
                <g key={key}>
                  {REGION_SHAPES[key].shapes.map((d, i) => (
                    <path
                      key={i}
                      d={d}
                      fill="var(--accent)"
                      fillOpacity={op * 0.55}
                      stroke="var(--accent)"
                      strokeOpacity="0.85"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}
