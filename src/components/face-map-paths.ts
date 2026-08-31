import type { FaceRegionKey } from '@/lib/face-regions';

/**
 * FaceMap 嘅純數據層：面部線稿 + 12 區可點按形狀。
 *
 * viewBox 0 0 200 260，正面、中性、極簡線稿 —— 刻意唔似任何真人
 * （報告會標明「示意圖，唔係你嘅相片」，PDPO 承諾唔儲存相片）。
 *
 * 形狀用兩個細 helper 生成 path 字串，方便逐個座標微調；
 * 輪廓線就手繪 cubic curve。改任何座標都係改呢個檔，FaceMap.tsx 唔使掂。
 */

/** 橢圓 path（cx,cy 中心；rx,ry 半徑） */
const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`;

/** 圓角矩形 path（x,y 左上角） */
const rrect = (x: number, y: number, w: number, h: number, r: number) =>
  `M ${x + r} ${y} h ${w - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - 2 * r} a ${r} ${r} 0 0 1 ${-r} ${r} h ${-(w - 2 * r)} a ${r} ${r} 0 0 1 ${-r} ${-r} v ${-(h - 2 * r)} a ${r} ${r} 0 0 1 ${r} ${-r} Z`;

/** 面部輪廓線稿（stroke only）。 */
export const OUTLINE_PATHS: string[] = [
  // 頭 / 面形（蛋形）
  'M 100 26 C 62 26 42 56 42 98 C 42 122 47 142 57 161 C 67 180 82 198 100 204 C 118 198 133 180 143 161 C 153 142 158 122 158 98 C 158 56 138 26 100 26 Z',
  // 髮際暗示
  'M 58 64 C 70 42 130 42 142 64',
  // 耳仔
  'M 42 102 C 34 98 32 112 37 122 C 40 129 45 131 47 126',
  'M 158 102 C 166 98 168 112 163 122 C 160 129 155 131 153 126',
  // 眉
  'M 56 88 C 64 83 78 83 86 87',
  'M 114 87 C 122 83 136 83 144 88',
  // 眼（杏形）
  'M 58 101 C 64 95 78 95 84 101 C 78 107 64 107 58 101 Z',
  'M 116 101 C 122 95 136 95 142 101 C 136 107 122 107 116 101 Z',
  // 鼻樑 + 鼻底
  'M 98 106 C 97 120 95 130 91 138',
  'M 102 106 C 103 120 105 130 109 138',
  'M 91 138 C 95 143 105 143 109 138',
  // 嘴
  'M 82 165 C 92 171 108 171 118 165',
  'M 88 161 C 94 158 106 158 112 161',
  // 頸 + 膊頭
  'M 80 202 L 80 230 C 80 240 66 246 48 252',
  'M 120 202 L 120 230 C 120 240 134 246 152 252',
];

export interface RegionShape {
  /** 畫出嚟嘅形狀（可以幾個，對稱區左右各一） */
  shapes: string[];
  /** 透明放大 hit 區（細區先需要；冇就直接用 shapes 接 tap） */
  hitShapes?: string[];
  /** 已揀數量 badge 圓心 */
  badge: [number, number];
}

/** overall_skin 冇面上形狀（picker 用 chip、display 用全面 wash），所以唔喺呢度。 */
export const REGION_SHAPES: Record<Exclude<FaceRegionKey, 'overall_skin'>, RegionShape> = {
  forehead: { shapes: [rrect(60, 52, 80, 26, 13)], badge: [134, 57] },
  glabella: {
    shapes: [ell(100, 92, 10, 9)],
    hitShapes: [ell(100, 92, 15, 13)],
    badge: [112, 84],
  },
  temples: {
    shapes: [ell(50, 90, 8, 12), ell(150, 90, 8, 12)],
    hitShapes: [ell(50, 90, 12, 16), ell(150, 90, 12, 16)],
    badge: [158, 79],
  },
  eyes: { shapes: [ell(71, 102, 17, 10), ell(129, 102, 17, 10)], badge: [147, 93] },
  nose: {
    shapes: [rrect(89, 106, 22, 38, 10)],
    hitShapes: [rrect(85, 104, 30, 42, 12)],
    badge: [113, 111] },
  cheeks: { shapes: [ell(67, 135, 15, 14), ell(133, 135, 15, 14)], badge: [147, 125] },
  nasolabial_mouth: {
    shapes: [ell(83, 156, 7, 14), ell(117, 156, 7, 14)],
    hitShapes: [ell(83, 156, 10, 17), ell(117, 156, 10, 17)],
    badge: [126, 146],
  },
  lips: {
    shapes: [ell(100, 165, 16, 8)],
    hitShapes: [ell(100, 165, 19, 11)],
    badge: [118, 156],
  },
  jaw_chin: { shapes: [ell(100, 188, 15, 11)], badge: [116, 180] },
  jawline_masseter: {
    shapes: [ell(64, 164, 10, 14), ell(136, 164, 10, 14)],
    badge: [147, 153],
  },
  neck: { shapes: [rrect(82, 206, 36, 30, 12)], badge: [120, 209] },
};

/**
 * tap 判定次序：大區先、細區後 —— SVG 後畫嘅元素接 tap，
 * 所以細區（眉心、嘴唇、鼻）永遠贏，唔會俾大區蓋住。
 */
export const REGION_DRAW_ORDER: Exclude<FaceRegionKey, 'overall_skin'>[] = [
  'forehead',
  'cheeks',
  'neck',
  'jawline_masseter',
  'nasolabial_mouth',
  'eyes',
  'jaw_chin',
  'nose',
  'temples',
  'glabella',
  'lips',
];

/** display 模式 overall_skin 嘅全面 wash（同面形一樣） */
export const FACE_WASH_PATH = OUTLINE_PATHS[0];
