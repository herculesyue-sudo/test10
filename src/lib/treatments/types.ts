/**
 * 療程資料庫的型別定義。
 *
 * 設計原則：AI 只負責「睇相講觀察」，唔負責砌療程。療程配對由呢度嘅
 * 規則引擎做，令建議可審計、可更新、可俾醫生 review — 而唔係靠模型記憶。
 */

/** 分析結果入面每一項可觀察嘅特徵。呢個 key 係 AI 輸出同療程庫之間唯一嘅介面。 */
export type FindingKey =
  // ── 膚質 / 色素 ──
  | 'pigmentation' // 曬斑、雀斑、老人斑
  | 'melasma' // 黃褐斑 / 荷爾蒙斑
  | 'pih' // 炎症後色素沉澱（暗瘡印）
  | 'redness' // 泛紅、微絲血管、玫瑰痤瘡傾向
  | 'acne_active' // 活躍暗瘡
  | 'acne_scar' // 凹凸洞 / 痘疤
  | 'pores' // 毛孔粗大
  | 'oiliness' // 油脂分泌旺盛
  | 'texture' // 膚質粗糙、暗啞、角質厚
  | 'dehydration' // 缺水、細紋、屏障弱
  // ── 動態紋 ──
  | 'forehead_lines' // 抬頭紋
  | 'glabellar_lines' // 眉心紋 / 川字紋
  | 'crows_feet' // 魚尾紋
  | 'bunny_lines' // 鼻背紋
  | 'perioral_lines' // 唇周紋 / 煙紋
  // ── 容積流失 ──
  | 'temple_hollow' // 太陽穴凹陷
  | 'midface_volume_loss' // 蘋果肌 / 中面部凹陷
  | 'tear_trough' // 淚溝
  | 'nasolabial_fold' // 法令紋
  | 'marionette_lines' // 木偶紋
  | 'chin_retrusion' // 下巴後縮 / 短下巴
  | 'lip_volume' // 唇量不足 / 唇形
  // ── 鬆弛 / 輪廓 ──
  | 'skin_laxity' // 整體皮膚鬆弛
  | 'brow_ptosis' // 眉尾下垂
  | 'upper_eyelid_hooding' // 上眼皮鬆弛遮蓋
  | 'jowls' // 嘴邊肉 / 下頜下垂
  | 'jawline_definition' // 下顎線不清晰
  | 'masseter_hypertrophy' // 咬肌肥大 / 國字臉
  | 'submental_fat' // 雙下巴 / 頜下脂肪
  | 'neck_laxity' // 頸部鬆弛 / 頸紋
  | 'facial_asymmetry' // 左右不對稱
  // ── 眼周 ──
  | 'dark_circles' // 黑眼圈
  | 'eye_bags'; // 眼袋

export const FINDING_LABELS: Record<FindingKey, string> = {
  pigmentation: '色斑 / 曬斑',
  melasma: '黃褐斑（荷爾蒙斑）',
  pih: '暗瘡印 / 色素沉澱',
  redness: '泛紅 / 微絲血管',
  acne_active: '活躍暗瘡',
  acne_scar: '凹凸洞 / 痘疤',
  pores: '毛孔粗大',
  oiliness: '油脂分泌旺盛',
  texture: '膚質粗糙 / 暗啞',
  dehydration: '缺水 / 屏障弱',
  forehead_lines: '抬頭紋',
  glabellar_lines: '眉心紋（川字紋）',
  crows_feet: '魚尾紋',
  bunny_lines: '鼻背紋',
  perioral_lines: '唇周紋',
  temple_hollow: '太陽穴凹陷',
  midface_volume_loss: '蘋果肌 / 中面部凹陷',
  tear_trough: '淚溝',
  nasolabial_fold: '法令紋',
  marionette_lines: '木偶紋',
  chin_retrusion: '下巴後縮 / 短下巴',
  lip_volume: '唇量 / 唇形',
  skin_laxity: '皮膚鬆弛',
  brow_ptosis: '眉尾下垂',
  upper_eyelid_hooding: '上眼皮鬆弛',
  jowls: '嘴邊肉 / 下頜下垂',
  jawline_definition: '下顎線不清晰',
  masseter_hypertrophy: '咬肌肥大（國字臉）',
  submental_fat: '雙下巴 / 頜下脂肪',
  neck_laxity: '頸部鬆弛 / 頸紋',
  facial_asymmetry: '左右不對稱',
  dark_circles: '黑眼圈',
  eye_bags: '眼袋',
};

/** 客人可以主動揀嘅「想改善」目標，會映射到一組 FindingKey。 */
export type GoalKey =
  | 'lift'
  | 'slim_face'
  | 'brighten'
  | 'clear_acne'
  | 'smooth_lines'
  | 'eye_area'
  | 'contour'
  | 'texture_pores'
  | 'hydration'
  | 'redness_calm';

export const GOALS: { key: GoalKey; label: string; desc: string; maps: FindingKey[] }[] = [
  {
    key: 'lift',
    label: '緊緻提升',
    desc: '面部鬆弛、下垂、想「拉提」',
    maps: ['skin_laxity', 'jowls', 'jawline_definition', 'brow_ptosis', 'neck_laxity', 'upper_eyelid_hooding'],
  },
  {
    key: 'slim_face',
    label: '瘦面 / V 面',
    desc: '面闊、咬肌大、雙下巴',
    maps: ['masseter_hypertrophy', 'submental_fat', 'jawline_definition'],
  },
  {
    key: 'brighten',
    label: '美白去斑',
    desc: '色斑、暗啞、膚色不均',
    maps: ['pigmentation', 'melasma', 'pih', 'texture'],
  },
  {
    key: 'clear_acne',
    label: '暗瘡 / 痘疤',
    desc: '生瘡、印、凹凸洞',
    maps: ['acne_active', 'acne_scar', 'pih', 'oiliness'],
  },
  {
    key: 'smooth_lines',
    label: '撫平皺紋',
    desc: '抬頭紋、川字紋、魚尾紋、法令紋',
    maps: ['forehead_lines', 'glabellar_lines', 'crows_feet', 'nasolabial_fold', 'marionette_lines', 'perioral_lines'],
  },
  {
    key: 'eye_area',
    label: '眼周改善',
    desc: '黑眼圈、眼袋、淚溝、幼紋',
    maps: ['dark_circles', 'eye_bags', 'tear_trough', 'crows_feet', 'upper_eyelid_hooding'],
  },
  {
    key: 'contour',
    label: '輪廓塑形',
    desc: '蘋果肌、太陽穴、下巴、唇形',
    maps: ['midface_volume_loss', 'temple_hollow', 'chin_retrusion', 'lip_volume', 'facial_asymmetry'],
  },
  {
    key: 'texture_pores',
    label: '毛孔 / 膚質',
    desc: '毛孔粗大、粗糙、油光',
    maps: ['pores', 'texture', 'oiliness'],
  },
  {
    key: 'hydration',
    label: '保濕 / 水光',
    desc: '乾燥、細紋、無光澤',
    maps: ['dehydration', 'texture'],
  },
  {
    key: 'redness_calm',
    label: '退紅 / 敏感',
    desc: '泛紅、微絲血管、易敏',
    maps: ['redness'],
  },
];

export type TreatmentCategory = 'injectable' | 'device' | 'topical';

/**
 * 客人睇嘅療程類型。
 *
 * 客人第一個問題永遠係「即係要打針定做機？」—— 唔係「用邊隻牌子」。
 * 呢個分類直接答咗佢最關心嘅三樣嘢：使唔使打針、痛唔痛、要唔要停工。
 * 所以喺報告度，類型行喺療程名前面。
 */
export const CATEGORY_LABELS: Record<TreatmentCategory, string> = {
  injectable: '注射療程',
  device: '儀器療程',
  topical: '外用護理',
};

/** 一句講清楚呢類係做咩，俾第一次接觸醫美嘅客人。 */
export const CATEGORY_EXPLAIN: Record<TreatmentCategory, string> = {
  injectable: '用幼針注射，即時或數星期見效，效果會隨時間代謝，需要定期補打。',
  device: '用儀器由皮膚表面導入能量，唔使打針，通常需要做幾次先見到完整效果。',
  topical: '外用或口服，需要持續使用，屬輔助性質。',
};

export interface Indication {
  key: FindingKey;
  /** 對呢個問題嘅療效權重，1（輔助）到 5（一線首選）。 */
  efficacy: 1 | 2 | 3 | 4 | 5;
}

export interface Treatment {
  id: string;
  /** 中文名（香港市場慣用叫法） */
  name: string;
  /** 英文 / 品牌名 */
  brand: string;
  category: TreatmentCategory;
  /** 例：肉毒桿菌素、透明質酸、膠原增生劑、HIFU、射頻、皮秒激光 */
  family: string;
  /** 作用原理，一句講清楚 */
  mechanism: string;
  indications: Indication[];
  /** 建議療程次數 */
  sessions: string;
  /** 療程間隔 */
  interval: string;
  /** 見效時間 */
  onset: string;
  /** 效果維持 */
  duration: string;
  /** 停工期（日） */
  downtimeDays: [number, number];
  /** 單次價（港元），unit 講明計價單位。priceStatus 為 'tbc' 時呢度會被忽略。 */
  priceHKD: { min: number; max: number; unit: string };
  /**
   * 'confirmed' = 已由診所核實嘅真實價錢，可以顯示俾客人睇
   * 'tbc'       = 未填 / 未核實，UI 會顯示「請洽診所」而唔會亂報價
   *
   * 預設係 'tbc'：報一個錯價俾客人，好過報一個你冇核實過嘅價。
   */
  priceStatus?: 'confirmed' | 'tbc';
  /** 風險等級：low / medium / high */
  risk: 'low' | 'medium' | 'high';
  /** 香港規管註記 */
  regulation: string;
  contraindications: string[];
  /** 客人會見到嘅提醒。⚠️ 呢度嘅字會原封不動出現喺報告，唔好寫開發備註。 */
  notes?: string;
  /** 內部備註：只會喺 check:catalogue 出現，永遠唔會顯示俾客人。 */
  internalNote?: string;
}
