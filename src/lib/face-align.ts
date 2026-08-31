import type { FaceLandmarks } from './schema';

/**
 * 面部對齊 —— 將示意圖嘅高亮層對準客人張真相。
 *
 * 數學：兩眼定旋轉 + 水平 scale（眼永遠對得正），嘴距另外定垂直 scale
 * （夾住範圍防怪比例）。刻意唔用三點最小二乘 —— Procrustes 會將誤差
 * 攤分俾眼同嘴，長面／短面兩邊都偏；軸分解就眼準嘴又準，剩低嘅只係
 * blob 形狀有界嘅垂直拉伸，軟橢圓上睇唔出。
 *
 * 任何唔妥 → 回 null → UI 靜默退返示意圖。**唔好**同客人講「你張相
 * 對唔準」—— 呢句話冇任何得着。
 *
 * 純函數、無 React —— test-engine 直接測。
 */

/** face-map-paths.ts 嘅畫布錨點（改嗰邊記得改埋呢邊，test 有恆等式守住） */
export const SVG_ANCHORS = {
  leftEye: { x: 71, y: 102 },
  rightEye: { x: 129, y: 102 },
  mouth: { x: 100, y: 165 },
  mid: { x: 100, y: 102 },
  eyeDist: 58,
  mouthDrop: 63,
} as const;

export type AlignMatrix = [number, number, number, number, number, number];

const inRange01 = (p: { x: number; y: number } | undefined) =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

/**
 * 伺服器端消毒（postProcess rule 0）：
 *  S1 缺欄／非數字 → 剷；S2 超 [0,1] → 剷；
 *  S3 模型用咗解剖學左右（rightEye.x < leftEye.x）→ 自動交換（平嘢，唔好嘥）；
 *  S4 交換後眼距 <0.04 → 剷（眼黐埋 = 屈出嚟）。
 */
export function sanitizeLandmarks(
  lm: FaceLandmarks | undefined,
): { landmarks?: FaceLandmarks; rule?: string } {
  if (!lm) return {};
  if (!inRange01(lm.leftEye) || !inRange01(lm.rightEye) || !inRange01(lm.mouthCenter)) {
    return { rule: 'landmarks-out-of-range' };
  }
  const chin = inRange01(lm.chin) ? lm.chin : undefined;
  let out: FaceLandmarks = { leftEye: lm.leftEye, rightEye: lm.rightEye, mouthCenter: lm.mouthCenter, chin };
  let rule: string | undefined;
  if (out.rightEye.x < out.leftEye.x) {
    out = { ...out, leftEye: out.rightEye, rightEye: out.leftEye };
    rule = 'landmarks-swapped';
  }
  if (out.rightEye.x - out.leftEye.x < 0.04) {
    return { rule: 'landmarks-eyes-collapsed' };
  }
  return { landmarks: out, rule };
}

/**
 * 由（已消毒嘅）定位點 + 相片像素尺寸計 SVG matrix(a b c d e f)，
 * 將示意圖座標 map 去相片像素。唔合格 → null。
 */
export function computeAlignment(lm: FaceLandmarks, W: number, H: number): AlignMatrix | null {
  if (!(W > 0 && H > 0)) return null;

  const l = { x: lm.leftEye.x * W, y: lm.leftEye.y * H };
  const r = { x: lm.rightEye.x * W, y: lm.rightEye.y * H };
  const m = { x: lm.mouthCenter.x * W, y: lm.mouthCenter.y * H };

  const dx = r.x - l.x;
  const dy = r.y - l.y;
  const eyeDist = Math.hypot(dx, dy);

  // C1 眼距太細：塊面得返一忽，多數係定位屈出嚟
  if (eyeDist < 0.08 * W) return null;
  // C2 側頭超過 25°：正面示意圖對唔上
  if (Math.abs(Math.atan2(dy, dx)) > (25 * Math.PI) / 180) return null;

  const cos = dx / eyeDist;
  const sin = dy / eyeDist;
  const sx = eyeDist / SVG_ANCHORS.eyeDist;
  const mid = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };

  // 嘴喺「面部座標系」入面嘅位置（反旋轉 mid→mouth 向量）
  const vx = m.x - mid.x;
  const vy = m.y - mid.y;
  const u = cos * vx + sin * vy; // 沿眼線方向，應該 ≈ 0
  const v = -sin * vx + cos * vy; // 沿面部向下，應該 > 0

  // C3 嘴要明顯喺眼下面；C4 嘴唔可以橫向飄
  if (v < 0.25 * eyeDist) return null;
  if (Math.abs(u) > 0.35 * eyeDist) return null;

  // C5 垂直比例 clamp 之前要合理 —— 超出範圍係幾何唔通，唔係長面
  const syRaw = v / SVG_ANCHORS.mouthDrop;
  if (syRaw < 0.6 * sx || syRaw > 1.8 * sx) return null;
  const sy = Math.min(1.35 * sx, Math.max(0.8 * sx, syRaw));

  // C6 有 chin 就核一核：三點自恰但下巴亂指 = 成組唔可信
  if (lm.chin) {
    const cx = lm.chin.x * W - mid.x;
    const cy = lm.chin.y * H - mid.y;
    const vChin = -sin * cx + cos * cy;
    if (!(vChin > v && vChin / v >= 1.15 && vChin / v <= 2.4)) return null;
  }

  // T = Translate(mid) · Rotate(θ) · Scale(sx, sy) · Translate(-MID)
  const a = sx * cos;
  const b = sx * sin;
  const c = -sy * sin;
  const d = sy * cos;
  const e = mid.x - (a * SVG_ANCHORS.mid.x + c * SVG_ANCHORS.mid.y);
  const f = mid.y - (b * SVG_ANCHORS.mid.x + d * SVG_ANCHORS.mid.y);

  // C7 下巴／額頭變換後唔可以大幅出界（少少溢出冇問題，overlay 有裁剪）
  const applyY = (px: number, py: number) => b * px + d * py + f;
  if (applyY(100, 188) > 1.15 * H) return null;
  if (applyY(100, 45) < -0.15 * H) return null;

  return [a, b, c, d, e, f];
}

/** 測試用：將示意圖座標經 matrix map 去相片像素。 */
export function applyMatrix(mtx: AlignMatrix, x: number, y: number): { x: number; y: number } {
  const [a, b, c, d, e, f] = mtx;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}
