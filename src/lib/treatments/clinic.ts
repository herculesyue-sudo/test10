import type { Treatment } from './types';

/**
 * ══════════════════════════════════════════════════════════════════
 *  Dr Timeless 療程目錄 —— 唯一會出現喺客人推薦入面嘅資料
 * ══════════════════════════════════════════════════════════════════
 *
 * 配對引擎只讀呢個檔案。推薦一個診所冇提供嘅療程，比冇推薦更差 ——
 * 等於用自己嘅工具幫客人搵競爭對手。
 *
 * `reference/` 資料夾有 36 個市場通用療程做複製模板，但**冇駁入引擎**。
 *
 * ── 現況 ──
 * 以下條目由公開資料整理（診所官網、社交媒體、媒體報道）。
 * 官網 drtimeless.com 喺開發環境被網絡代理封鎖，攞唔到完整療程列表同價目表。
 *
 * ⚠️ 所有 priceStatus: 'tbc' 嘅條目都**未有真實價錢**，UI 會顯示「價格請洽診所」
 *    而唔會亂報價。填返真實價錢之後，將 priceStatus 改做 'confirmed'。
 *
 * ⚠️ 呢個列表大概率**唔完整**。請補齊診所實際提供嘅所有療程 ——
 *    漏咗嘅療程永遠唔會被推薦到。
 *
 * 執行 `npm run check:catalogue` 可以睇邊啲條目仲欠資料。
 */

const DOCTOR_ONLY = '香港：須由註冊醫生施行（衞生署高風險美容程序）';

/** 診所定位：單次消費，唔綁療程套票。 */
export const CLINIC_POLICY = {
  name: 'Dr Timeless',
  /** 單次消費係診所嘅賣點，會喺報告顯示 */
  payPerSession: true,
  payPerSessionNote: '單次消費，唔需要買套票',
  address: '佐敦彌敦道 241–243 號香港健康檢查中心 14 樓 1403 室',
  hours: '二至五 12:00–21:00 · 六及公眾假期 10:00–19:00 · 逢一休息',
};

export const CLINIC_TREATMENTS: Treatment[] = [
  // ══════════════════ 激光 / 色素管理 ══════════════════
  {
    id: 'hollywood-spectra',
    name: '荷里活激光（白瓷娃娃）',
    brand: 'Hollywood Spectra (Lutronic)',
    category: 'device',
    family: '調Q開關 Nd:YAG 激光',
    mechanism:
      '1064nm / 532nm 雙波長調Q激光，可作淺層碳粉煥膚（收毛孔、控油、提亮）或低能量 toning（逐層擊碎色素）。原廠認證機。',
    indications: [
      { key: 'pigmentation', efficacy: 5 },
      { key: 'melasma', efficacy: 4 },
      { key: 'pih', efficacy: 4 },
      { key: 'texture', efficacy: 4 },
      { key: 'pores', efficacy: 4 },
      { key: 'oiliness', efficacy: 3 },
      { key: 'acne_active', efficacy: 3 },
    ],
    sessions: '4–6 次',
    interval: '每次相隔 2–4 星期',
    onset: '2–3 次後可見',
    duration: '需防曬維持',
    downtimeDays: [0, 2],
    priceHKD: { min: 0, max: 0, unit: '每次' },
    priceStatus: 'tbc',
    risk: 'medium',
    regulation: DOCTOR_ONLY,
    contraindications: ['懷孕', '近期曬傷', '正服食光敏感藥物', '活躍疱疹'],
    notes: '黃褐斑須用低能量多次數，能量過高會反黑，亞洲膚色尤其要小心。',
  },

  // ══════════════════ 射頻緊緻 ══════════════════
  {
    id: 'thermage-flx',
    name: 'Thermage FLX 電波拉皮',
    brand: 'Thermage FLX (Solta)',
    category: 'device',
    family: '單極射頻 (Monopolar RF)',
    mechanism: '體積式加熱真皮至 65–75°C，令膠原即時收縮並啟動長達 6 個月嘅新生。原廠正貨，探頭有認證編號可查核。',
    indications: [
      { key: 'skin_laxity', efficacy: 5 },
      { key: 'texture', efficacy: 4 },
      { key: 'jowls', efficacy: 4 },
      { key: 'pores', efficacy: 3 },
      { key: 'neck_laxity', efficacy: 3 },
    ],
    sessions: '1 次',
    interval: '12–18 個月',
    onset: '即時緊緻 + 3–6 個月漸進',
    duration: '12–24 個月',
    downtimeDays: [0, 1],
    priceHKD: { min: 0, max: 0, unit: '每次' },
    priceStatus: 'tbc',
    risk: 'medium',
    regulation: DOCTOR_ONLY,
    contraindications: ['懷孕', '心臟起搏器 / 植入式除顫器', '治療區金屬植入物'],
    notes: '偏向緊緻同收細毛孔，提升力度不及 HIFU；兩者常配搭（一緊一提）。',
  },

  // ══════════════════ 超聲波提升 ══════════════════
  {
    id: 'hifu',
    name: 'HIFU 聚焦超聲波提升',
    brand: 'HIFU',
    category: 'device',
    family: '微聚焦超聲波 (HIFU)',
    mechanism: '將超聲波能量聚焦於不同深度（含 SMAS 筋膜層），造成熱凝固點刺激膠原收縮同新生，達致提升效果。',
    indications: [
      { key: 'skin_laxity', efficacy: 5 },
      { key: 'jowls', efficacy: 5 },
      { key: 'jawline_definition', efficacy: 4 },
      { key: 'brow_ptosis', efficacy: 4 },
      { key: 'neck_laxity', efficacy: 4 },
      { key: 'upper_eyelid_hooding', efficacy: 3 },
    ],
    sessions: '1 次',
    interval: '9–18 個月',
    onset: '1–3 個月漸進',
    duration: '9–18 個月',
    downtimeDays: [0, 2],
    priceHKD: { min: 0, max: 0, unit: '每次' },
    priceStatus: 'tbc',
    risk: 'medium',
    regulation: DOCTOR_ONLY,
    contraindications: ['懷孕', '治療區金屬植入物 / 心臟起搏器', '嚴重活躍暗瘡', '面部填充劑未穩定'],
    notes: '⚠️ 請補充實際機型（例如 Ultraformer III / Doublo / Ultherapy），因為深度探頭同計價方式差異好大。',
  },

  // ══════════════════ 溶脂 / 身體塑形 ══════════════════
  {
    id: 'onda-plus',
    name: 'Onda Plus 微波溶脂',
    brand: 'Onda Plus (DEKA)',
    category: 'device',
    family: '微波 Coolwaves',
    mechanism: '特定頻率微波選擇性作用於脂肪細胞，破壞細胞膜同時緊緻表層皮膚，可處理局部脂肪同橙皮紋。',
    indications: [
      { key: 'submental_fat', efficacy: 4 },
      { key: 'skin_laxity', efficacy: 3 },
      { key: 'jawline_definition', efficacy: 3 },
    ],
    sessions: '3–4 次',
    interval: '每次相隔 2–4 星期',
    onset: '4–8 星期',
    duration: '脂肪細胞減少後屬長期，但體重增加仍會反彈',
    downtimeDays: [0, 2],
    priceHKD: { min: 0, max: 0, unit: '每個部位' },
    priceStatus: 'tbc',
    risk: 'low',
    regulation: '一般由受訓治療師施行，建議先經醫生評估',
    contraindications: ['懷孕', '治療區金屬植入物', '心臟起搏器', '治療區疝氣'],
    notes: '⚠️ 請確認診所主要用喺面部（雙下巴）定身體部位，兩者配對邏輯唔同。',
  },

  // ══════════════════ 注射 / 皮膚管理 ══════════════════
  {
    id: 'skinbooster',
    name: '水光針',
    brand: '',
    category: 'injectable',
    family: '微量透明質酸注射 (Skin Booster)',
    mechanism: '真皮層微量多點注射透明質酸，提升含水量、光澤同細紋。',
    indications: [
      { key: 'dehydration', efficacy: 5 },
      { key: 'texture', efficacy: 4 },
      { key: 'pores', efficacy: 3 },
    ],
    sessions: '3 次為一個療程',
    interval: '每次相隔 3–4 星期',
    onset: '1–2 星期',
    duration: '4–6 個月',
    downtimeDays: [1, 3],
    priceHKD: { min: 0, max: 0, unit: '每次' },
    priceStatus: 'tbc',
    risk: 'low',
    regulation: DOCTOR_ONLY,
    contraindications: ['注射區感染或活躍暗瘡', '懷孕/哺乳'],
    notes: '⚠️ 請補充實際使用嘅品牌（例如 Restylane Vital / Juvederm Volite / Neuramis），品牌影響效果同價錢。',
  },
  {
    id: 'exosome',
    name: '外泌體療程',
    brand: '',
    category: 'injectable',
    family: '再生醫學 (Exosome)',
    mechanism: '外泌體傳遞生長因子訊號，加速修復、抗炎，改善泛紅同暗瘡後皮膚。',
    indications: [
      { key: 'redness', efficacy: 4 },
      { key: 'pih', efficacy: 4 },
      { key: 'texture', efficacy: 4 },
      { key: 'acne_active', efficacy: 3 },
      { key: 'dehydration', efficacy: 3 },
    ],
    sessions: '3–5 次',
    interval: '每次相隔 2–4 星期',
    onset: '1–3 星期',
    duration: '視乎配合療程',
    downtimeDays: [0, 2],
    priceHKD: { min: 0, max: 0, unit: '每次' },
    priceStatus: 'tbc',
    risk: 'medium',
    regulation: '產品規管仍在演變中，宜使用有清晰來源同認證嘅產品',
    contraindications: ['懷孕/哺乳', '活躍感染', '惡性腫瘤病史（需醫生評估）'],
    notes: '⚠️ 請補充實際品牌。多數配合微針或激光導入。',
  },
  {
    id: 'lipolysis-injection',
    name: '溶脂針',
    brand: '',
    category: 'injectable',
    family: '脂肪溶解注射',
    mechanism: '破壞脂肪細胞膜，經代謝清除局部脂肪。',
    indications: [{ key: 'submental_fat', efficacy: 4 }],
    sessions: '2–4 次',
    interval: '每次相隔 4–6 星期',
    onset: '4–8 星期',
    duration: '脂肪細胞減少後屬長期，但體重增加仍會反彈',
    downtimeDays: [3, 10],
    priceHKD: { min: 0, max: 0, unit: '每個部位' },
    priceStatus: 'tbc',
    risk: 'high',
    regulation: '須由註冊醫生施行；部分溶脂產品屬處方藥，請確認產品來源',
    contraindications: ['懷孕/哺乳', '吞嚥困難', '注射區感染', '頜下腫塊未確診'],
    notes: '⚠️ 請補充實際品牌同適用部位。腫脹明顯，可持續 1–2 星期。',
  },

  // ══════════════════ 美白 ══════════════════
  {
    id: 'whitening',
    name: '美白療程',
    brand: '',
    category: 'injectable',
    family: '美白',
    mechanism: '⚠️ 待補充：請講明係注射式（美白針 / 傳明酸）定係外用導入，兩者機制、規管同價錢都唔同。',
    indications: [
      { key: 'pigmentation', efficacy: 3 },
      { key: 'texture', efficacy: 3 },
      { key: 'pih', efficacy: 3 },
    ],
    sessions: '待補充',
    interval: '待補充',
    onset: '待補充',
    duration: '待補充',
    downtimeDays: [0, 1],
    priceHKD: { min: 0, max: 0, unit: '每次' },
    priceStatus: 'tbc',
    risk: 'medium',
    regulation: '⚠️ 待確認：注射式美白針屬處方藥物範疇，須由註冊醫生評估及施行',
    contraindications: ['懷孕/哺乳', '肝腎功能異常（需醫生評估）'],
    notes: '⚠️ 呢一條資料最不完整，請優先補齊或者刪除。',
  },
];

/**
 * 診所提供、但唔屬於「睇相配對」範圍嘅服務。
 * 唔會入配對引擎（相片睇唔到疣、痣嘅性質，AI 亦唔應該判斷），
 * 但會喺報告尾顯示做「其他服務」，等客人知道診所做到。
 */
export const CLINIC_OTHER_SERVICES: { name: string; note: string }[] = [
  {
    name: '脫疣 / 祛斑',
    note: '疣、癦、油脂粒等皮膚增生物切除。須由醫生現場檢查確認性質後先可以處理 —— 相片分析唔會、亦唔應該判斷呢類病灶。',
  },
  {
    name: '皮膚管理諮詢',
    note: '由醫生評估膚質、制定長期護理同療程計劃。',
  },
];
