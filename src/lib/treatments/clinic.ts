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

/**
 * 診所同時備有多隻牌子。
 *
 * 香港客人好多時係直接 search 品牌名（「邊度打 Xeomin」、「Juvederm 邊間平」），
 * 所以品牌一定要寫出嚟 —— 唔寫等於喺搜尋結果度隱形。
 *
 * 但唔可以喺報告度幫客人指定咗用邊隻：揀邊隻係醫生按部位、劑量、
 * 皮膚厚度同過往反應決定嘅臨床判斷。所以呢度列齊選擇，然後由 notes
 * 講明「由醫生揀」。
 */
const BTX_BRANDS = 'Botox (Allergan) · Dysport (Galderma) · Xeomin (Merz)';
const BTX_NOTE = '診所三隻牌子都有（Botox / Dysport / Xeomin），由醫生按部位、劑量同你過往反應揀。三者擴散性同起效時間略有分別，效果本身冇高低之分。';

const HA_BRANDS = 'Juvederm (Allergan) · Belotero (Merz)';
const HA_NOTE = '診所備有 Juvederm 同 Belotero 系列。唔同部位需要唔同硬度（G prime）—— 下巴要撐得起，淚溝要夠軟先唔會凹凸，所以由醫生按部位揀，唔係邊隻貴就邊隻好。';

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
    id: 'ultraformer',
    name: 'Ultraformer MPT 聚焦超聲波提升',
    brand: 'Ultraformer MPT (Classys)',
    category: 'device',
    family: '微聚焦超聲波 (HIFU)',
    mechanism:
      '多種深度探頭（1.5–13mm）將超聲波能量聚焦於真皮至 SMAS 筋膜層，造成熱凝固點刺激膠原收縮同新生；深層探頭亦可作局部溶脂。MPT 型號可調節發數密度同速度，痛感較上一代低。',
    indications: [
      { key: 'skin_laxity', efficacy: 5 },
      { key: 'jowls', efficacy: 5 },
      { key: 'jawline_definition', efficacy: 4 },
      { key: 'brow_ptosis', efficacy: 4 },
      { key: 'neck_laxity', efficacy: 4 },
      { key: 'upper_eyelid_hooding', efficacy: 3 },
    ],
    sessions: '1 次；可 6–12 個月重覆',
    interval: '6–12 個月',
    onset: '1–3 個月漸進',
    duration: '9–12 個月',
    downtimeDays: [0, 2],
    priceHKD: { min: 0, max: 0, unit: '每次（按發數）' },
    priceStatus: 'tbc',
    risk: 'medium',
    regulation: DOCTOR_ONLY,
    contraindications: ['懷孕', '治療區金屬植入物 / 心臟起搏器', '嚴重活躍暗瘡', '面部填充劑未穩定（建議相隔 2 週）'],
    notes: '按「發數」計，但比較發數要留意探頭深度，唔淨係睇總數 —— 同樣 300 發，深層探頭同淺層探頭做出嚟嘅效果差好遠。',
    internalNote: 'MPT 已確認。落價錢嗰陣記住 MPT 同 III 嘅發數計價唔同，唔好照抄舊價目表。',
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
    internalNote: '請確認主要用喺面部（雙下巴）定身體部位 —— 兩者配對邏輯唔同。',
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
    internalNote: '請補充實際品牌（Restylane Vital / Juvederm Volite / Neuramis 等）。',
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
    notes: '多數配合微針或激光導入。',
    internalNote: '請補充實際品牌。',
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
    regulation: '須由註冊醫生施行；部分溶脂產品屬處方藥物，使用前可向醫生查核產品註冊資料',
    contraindications: ['懷孕/哺乳', '吞嚥困難', '注射區感染', '頜下腫塊未確診'],
    notes: '腫脹明顯，可持續 1–2 星期。',
    internalNote: '請補充實際品牌同適用部位。',
  },

  // ══════════════════ 肉毒桿菌素 ══════════════════
  {
    id: 'btx-masseter',
    name: '肉毒瘦面（咬肌）',
    brand: BTX_BRANDS,
    category: 'injectable',
    family: '肉毒桿菌素 (Botulinum Toxin A)',
    mechanism: '阻斷神經肌肉訊號，令肥大嘅咬肌逐步萎縮，面部下半部收窄。',
    indications: [
      { key: 'masseter_hypertrophy', efficacy: 5 },
      { key: 'jawline_definition', efficacy: 3 },
    ],
    sessions: '1 次；首年建議 2–3 次鞏固',
    interval: '4–6 個月',
    onset: '2–4 星期開始，6–8 星期最明顯',
    duration: '4–6 個月',
    downtimeDays: [0, 1],
    priceHKD: { min: 0, max: 0, unit: '每次（雙側）' },
    priceStatus: 'tbc',
    risk: 'medium',
    regulation: DOCTOR_ONLY,
    contraindications: ['懷孕/哺乳', '神經肌肉疾病（如重症肌無力）', '注射部位感染', '對配方成分過敏'],
    notes: `劑量或位置唔啱可致咀嚼無力、面頰凹陷、笑容不對稱。${BTX_NOTE}`,
    internalNote: '品牌已確認：Botox / Dysport / Xeomin 三隻都有。落價錢嗰陣三隻應該係唔同價，可能要拆做三個條目 —— 睇你想唔想喺報告度俾客人揀。',
  },
  {
    id: 'btx-upper-face',
    name: '肉毒除皺（上面部）',
    brand: BTX_BRANDS,
    category: 'injectable',
    family: '肉毒桿菌素 (Botulinum Toxin A)',
    mechanism: '放鬆額肌、皺眉肌、眼輪匝肌，撫平因表情產生嘅動態紋。',
    indications: [
      { key: 'forehead_lines', efficacy: 5 },
      { key: 'glabellar_lines', efficacy: 5 },
      { key: 'crows_feet', efficacy: 5 },
      { key: 'bunny_lines', efficacy: 4 },
      { key: 'brow_ptosis', efficacy: 3 },
    ],
    sessions: '1 次',
    interval: '3–4 個月',
    onset: '3–7 日',
    duration: '3–5 個月',
    downtimeDays: [0, 1],
    priceHKD: { min: 0, max: 0, unit: '每個部位' },
    priceStatus: 'tbc',
    risk: 'medium',
    regulation: DOCTOR_ONLY,
    contraindications: ['懷孕/哺乳', '神經肌肉疾病', '注射部位感染'],
    notes: `適合仍有彈性嘅動態紋；已成形嘅靜態深紋需要配合填充或激光。眼皮下垂為已知風險。${BTX_NOTE}`,
    internalNote: '品牌已確認（Botox / Dysport / Xeomin）。仲要確認係咪按「部位」計價、定係按單位（unit）計 —— Dysport 嘅單位換算同另外兩隻唔同，唔講清楚客人會以為平咗。',
  },
  {
    id: 'btx-microtox',
    name: '微滴肉毒（水光肉毒）',
    brand: BTX_BRANDS,
    category: 'injectable',
    family: '肉毒桿菌素 (Botulinum Toxin A)',
    mechanism: '極稀釋劑量淺層注射真皮，收細毛孔、減少油脂分泌、提升皮膚光澤。',
    indications: [
      { key: 'pores', efficacy: 4 },
      { key: 'oiliness', efficacy: 4 },
      { key: 'texture', efficacy: 3 },
    ],
    sessions: '2–3 次',
    interval: '3–4 個月',
    onset: '2–3 星期',
    duration: '3–4 個月',
    downtimeDays: [0, 2],
    priceHKD: { min: 0, max: 0, unit: '每次（全面）' },
    priceStatus: 'tbc',
    risk: 'medium',
    regulation: DOCTOR_ONLY,
    contraindications: ['懷孕/哺乳', '神經肌肉疾病', '注射部位感染'],
    notes: BTX_NOTE,
    internalNote: '品牌已確認。但「診所有冇做微滴肉毒」仲未答 —— 如果冇做就要刪除呢個條目，否則個工具會推薦一個你唔提供嘅療程。',
  },

  // ══════════════════ 透明質酸填充 ══════════════════
  {
    id: 'ha-midface',
    name: '透明質酸填充（中面部 / 蘋果肌）',
    brand: HA_BRANDS,
    category: 'injectable',
    family: '透明質酸 (Hyaluronic Acid)',
    mechanism: '深層補充流失容積，重建中面部支撐；中面部有咗支撐，法令紋同下垂會一併改善。',
    indications: [
      { key: 'midface_volume_loss', efficacy: 5 },
      { key: 'nasolabial_fold', efficacy: 4 },
      { key: 'facial_asymmetry', efficacy: 4 },
      { key: 'skin_laxity', efficacy: 3 },
    ],
    sessions: '1 次；視乎流失程度 1–3cc',
    interval: '12–18 個月補打',
    onset: '即時',
    duration: '12–24 個月',
    downtimeDays: [1, 5],
    priceHKD: { min: 0, max: 0, unit: '每 cc' },
    priceStatus: 'tbc',
    risk: 'high',
    regulation: DOCTOR_ONLY,
    contraindications: ['懷孕/哺乳', '自體免疫疾病活躍期', '注射區感染或發炎', '對透明質酸/利多卡因過敏'],
    notes: '最嚴重風險為血管栓塞致皮膚壞死或失明；必須由熟悉解剖嘅醫生施行，並須備有溶解酶。' + HA_NOTE,
    internalNote: '品牌系列已確認（Juvederm / Belotero）。中面部一般用高支撐款（Juvederm Voluma 級數）—— 確認下實際入邊隻，同計價單位係每 cc 定每支。',
  },
  {
    id: 'ha-tear-trough',
    name: '透明質酸淚溝填充',
    brand: HA_BRANDS,
    category: 'injectable',
    family: '透明質酸 (Hyaluronic Acid)',
    mechanism: '填補眼下凹陷，減少陰影造成嘅「黑眼圈」觀感。',
    indications: [
      { key: 'tear_trough', efficacy: 5 },
      { key: 'dark_circles', efficacy: 3 },
      { key: 'eye_bags', efficacy: 2 },
    ],
    sessions: '1 次',
    interval: '9–18 個月',
    onset: '即時，7–14 日穩定',
    duration: '9–18 個月',
    downtimeDays: [2, 7],
    priceHKD: { min: 0, max: 0, unit: '每 cc' },
    priceStatus: 'tbc',
    risk: 'high',
    regulation: DOCTOR_ONLY,
    contraindications: ['嚴重眼袋（脂肪疝出）', '甲狀腺眼病', '懷孕/哺乳', '注射區感染'],
    notes: '眼下皮膚薄，易現丁達爾效應（藍光）同水腫。色素型黑眼圈填充無效，要用激光處理。' + HA_NOTE,
    internalNote: '品牌系列已確認。淚溝一般用最軟嘅款（Belotero Balance / Soft 級數）—— 確認下實際入邊隻。',
  },
  {
    id: 'ha-chin-jaw',
    name: '透明質酸下巴 / 下顎線塑形',
    brand: HA_BRANDS,
    category: 'injectable',
    family: '透明質酸 (Hyaluronic Acid)',
    mechanism: '高支撐力配方延長下巴、勾勒下顎線，改善側面線條、短下巴同嘴角下垂。',
    indications: [
      { key: 'chin_retrusion', efficacy: 5 },
      { key: 'jawline_definition', efficacy: 5 },
      { key: 'marionette_lines', efficacy: 4 },
      { key: 'facial_asymmetry', efficacy: 3 },
    ],
    sessions: '1 次；一般 1–3cc',
    interval: '18–24 個月',
    onset: '即時',
    duration: '18–24 個月',
    downtimeDays: [1, 5],
    priceHKD: { min: 0, max: 0, unit: '每 cc' },
    priceStatus: 'tbc',
    risk: 'high',
    regulation: DOCTOR_ONLY,
    contraindications: ['懷孕/哺乳', '注射區感染', '嚴重咬合問題（應先見牙科 / 正頜）'],
    notes: HA_NOTE,
    internalNote: '品牌系列已確認。下巴／下顎線要最高支撐力（Juvederm Volux 級數）—— 確認下實際入邊隻。',
  },
  {
    id: 'ha-temple',
    name: '透明質酸太陽穴填充',
    brand: HA_BRANDS,
    category: 'injectable',
    family: '透明質酸 (Hyaluronic Acid)',
    mechanism: '補充顳部凹陷，令上面部飽滿、面形線條更順滑。',
    indications: [
      { key: 'temple_hollow', efficacy: 5 },
      { key: 'brow_ptosis', efficacy: 2 },
    ],
    sessions: '1 次',
    interval: '12–24 個月',
    onset: '即時',
    duration: '12–24 個月',
    downtimeDays: [1, 4],
    priceHKD: { min: 0, max: 0, unit: '每 cc' },
    priceStatus: 'tbc',
    risk: 'high',
    regulation: DOCTOR_ONLY,
    contraindications: ['懷孕/哺乳', '注射區感染'],
    notes: '顳部血管豐富，屬高風險注射區。' + HA_NOTE,
    internalNote: '品牌系列已確認（Juvederm / Belotero）。',
  },
  {
    id: 'ha-lip',
    name: '透明質酸豐唇',
    brand: HA_BRANDS,
    category: 'injectable',
    family: '透明質酸 (Hyaluronic Acid)',
    mechanism: '增加唇部容積、修飾唇珠同唇緣線條。',
    indications: [
      { key: 'lip_volume', efficacy: 5 },
      { key: 'perioral_lines', efficacy: 3 },
    ],
    sessions: '1 次',
    interval: '9–15 個月',
    onset: '即時，7 日消腫',
    duration: '9–15 個月',
    downtimeDays: [3, 7],
    priceHKD: { min: 0, max: 0, unit: '每 cc' },
    priceStatus: 'tbc',
    risk: 'medium',
    regulation: DOCTOR_ONLY,
    contraindications: ['活躍唇皰疹', '懷孕/哺乳', '注射區感染'],
    notes: '有唇皰疹病史者宜術前預防性服抗病毒藥。' + HA_NOTE,
    internalNote: '品牌系列已確認。但「診所有冇做豐唇」仲未答 —— 冇做就要刪除呢個條目。',
  },

  // ══════════════════ 美白 ══════════════════
  {
    id: 'whitening',
    name: '美白療程',
    brand: '',
    category: 'injectable',
    family: '美白',
    mechanism: '透過抑制黑色素生成同促進代謝，改善整體膚色。',
    indications: [
      { key: 'pigmentation', efficacy: 3 },
      { key: 'texture', efficacy: 3 },
      { key: 'pih', efficacy: 3 },
    ],
    sessions: '由醫生評估後決定',
    interval: '由醫生評估後決定',
    onset: '由醫生評估後決定',
    duration: '由醫生評估後決定',
    downtimeDays: [0, 1],
    priceHKD: { min: 0, max: 0, unit: '每次' },
    priceStatus: 'tbc',
    risk: 'medium',
    regulation: '如屬注射式，涉及處方藥物，須由註冊醫生評估及施行',
    contraindications: ['懷孕/哺乳', '肝腎功能異常（需醫生評估）'],
    internalNote: '資料最不完整：機制、次數、間隔、見效、維持、規管全部未填。請優先補齊，或者由目錄刪除。',
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
