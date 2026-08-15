import type { Analysis } from './schema';
import type { GoalKey } from './treatments/types';

/**
 * 測試模式嘅假分析數據。
 *
 * 重點：假嘅只係「AI 睇相嘅結果」。呢啲 findings 之後會照樣餵去真正嘅
 * 配對引擎，所以推薦療程、分數、價格、禁忌過濾、預約連結全部係真嘅邏輯。
 * 咁樣測試版睇到嘅嘢 = 正式版睇到嘅嘢，唔會出現「demo 靚仔但真機唔同樣」。
 *
 * 開啟方法：.env 加 DEMO_MODE=1（唔使 ANTHROPIC_API_KEY，唔會有任何 API 費用）
 */

export interface DemoCase {
  id: string;
  label: string;
  /** 呢個個案主要對應邊啲改善目標，用嚟按客人揀嘅嘢配對最貼題嘅假數據 */
  matches: GoalKey[];
  analysis: Analysis;
}

export const DEMO_CASES: DemoCase[] = [
  {
    id: 'acne',
    label: '26 歲 · 暗瘡同印為主',
    matches: ['clear_acne', 'texture_pores', 'redness_calm'],
    analysis: {
      imageQuality: { usable: true, lighting: 'good', issues: [], makeupDetected: false },
      structure: {
        faceShape: 'oval',
        faceShapeNote: '鵝蛋面，輪廓比例平均，暫時未見明顯鬆弛，重點應該放喺膚質而唔係提升。',
        symmetryScore: 88,
        agingPattern: 'minimal',
        estimatedSkinType: 'III',
      },
      findings: [
        {
          key: 'acne_active',
          severity: 62,
          confidence: 0.82,
          observation: '兩邊面頰同下巴見到數粒發炎性丘疹，部分帶紅腫，屬中度活躍暗瘡。',
          location: '雙側面頰、下巴',
        },
        {
          key: 'pih',
          severity: 68,
          confidence: 0.85,
          observation: '舊暗瘡位置留低啡紅色印，分佈同現存暗瘡吻合，屬炎症後色素沉澱而唔係色斑。',
          location: '雙側面頰',
        },
        {
          key: 'pores',
          severity: 55,
          confidence: 0.78,
          observation: 'T 字位同鼻翼兩側毛孔明顯擴張，呈水滴狀。',
          location: 'T 字位、鼻翼',
        },
        {
          key: 'oiliness',
          severity: 58,
          confidence: 0.7,
          observation: '額頭同鼻樑有明顯反光，屬油性至混合性膚質。',
          location: 'T 字位',
        },
        {
          key: 'redness',
          severity: 42,
          confidence: 0.72,
          observation: '面頰有瀰漫性泛紅，主要集中喺暗瘡周圍，未見明顯微絲血管。',
          location: '雙側面頰',
        },
        {
          key: 'texture',
          severity: 45,
          confidence: 0.75,
          observation: '膚質欠均勻，局部有粗糙感同輕微角質堆積。',
          location: '整體',
        },
      ],
      overallSummary:
        '你嘅主要問題係中度活躍暗瘡連同明顯嘅暗瘡印，兩者要分開處理 —— 先控制發炎，印先會退得快。毛孔同油脂分泌偏旺，屬混合性膚質。面部輪廓同緊緻度暫時良好，唔需要考慮提升類療程。',
      redFlags: [],
    },
  },
  {
    id: 'pigment',
    label: '35 歲 · 色斑同暗啞為主',
    matches: ['brighten', 'hydration', 'texture_pores'],
    analysis: {
      imageQuality: { usable: true, lighting: 'good', issues: ['輕微側光造成右面陰影'], makeupDetected: false },
      structure: {
        faceShape: 'heart',
        faceShapeNote: '心形面，額部較闊、下巴尖，中面部開始見到輕微容積流失，但未算明顯。',
        symmetryScore: 84,
        agingPattern: 'photoaging',
        estimatedSkinType: 'III',
      },
      findings: [
        {
          key: 'pigmentation',
          severity: 66,
          confidence: 0.86,
          observation: '雙側顴骨見到邊界清晰、大小不一嘅啡色斑點，屬典型曬斑分佈。',
          location: '雙側顴骨',
        },
        {
          key: 'melasma',
          severity: 48,
          confidence: 0.55,
          observation: '顴骨外側有片狀、邊界較模糊嘅較深色區域，左右大致對稱，傾向黃褐斑，但單靠相片難以同曬斑完全分辨。',
          location: '雙側顴骨外側',
        },
        {
          key: 'texture',
          severity: 52,
          confidence: 0.8,
          observation: '整體膚色欠通透，光澤度偏低，有輕微暗啞感。',
          location: '整體',
        },
        {
          key: 'dehydration',
          severity: 47,
          confidence: 0.68,
          observation: '眼周同面頰見到細幼乾紋，笑起身較明顯，屬缺水性細紋。',
          location: '眼周、面頰',
        },
        {
          key: 'pores',
          severity: 38,
          confidence: 0.72,
          observation: '面頰毛孔輕微擴張，程度尚可接受。',
          location: '雙側面頰',
        },
        {
          key: 'nasolabial_fold',
          severity: 35,
          confidence: 0.7,
          observation: '法令紋輕微加深，靜態時仍然淺，屬早期。',
          location: '雙側鼻唇溝',
        },
      ],
      overallSummary:
        '你嘅主要問題係光老化 —— 顴骨嘅曬斑同整體暗啞。要留意嘅係，其中有部分區域傾向黃褐斑，呢兩樣處理方法完全唔同（黃褐斑用錯激光會反黑），建議面診時由醫生用皮膚鏡確認先落療程。皮膚同時偏乾，補濕做好會令膚色睇落通透好多。',
      redFlags: [],
    },
  },
  {
    id: 'aging',
    label: '47 歲 · 鬆弛同容積流失',
    matches: ['lift', 'contour', 'smooth_lines', 'eye_area', 'slim_face'],
    analysis: {
      imageQuality: { usable: true, lighting: 'fair', issues: [], makeupDetected: false },
      structure: {
        faceShape: 'square',
        faceShapeNote: '下頜角較明顯，配合中面部容積流失，令面部視覺重心下移，係典型嘅「下垂型」老化表現。',
        symmetryScore: 79,
        agingPattern: 'mixed',
        estimatedSkinType: 'III',
      },
      findings: [
        {
          key: 'skin_laxity',
          severity: 71,
          confidence: 0.83,
          observation: '面部整體皮膚張力下降，中下面部軟組織有向下位移嘅跡象。',
          location: '整體',
        },
        {
          key: 'midface_volume_loss',
          severity: 68,
          confidence: 0.8,
          observation: '蘋果肌位置扁平，顴骨下方見到陰影凹陷，屬中面部容積流失。',
          location: '雙側中面部',
        },
        {
          key: 'nasolabial_fold',
          severity: 64,
          confidence: 0.85,
          observation: '法令紋靜態時已經清晰可見，深度中等，同中面部容積流失有直接關係。',
          location: '雙側鼻唇溝',
        },
        {
          key: 'jowls',
          severity: 58,
          confidence: 0.72,
          observation: '下頜線兩側見到輕度嘴邊肉，令下顎輪廓唔夠俐落。',
          location: '雙側下頜',
        },
        {
          key: 'jawline_definition',
          severity: 55,
          confidence: 0.68,
          observation: '下顎線界線變模糊。正面相難以完整評估，建議補一張側面相。',
          location: '下顎線',
        },
        {
          key: 'tear_trough',
          severity: 52,
          confidence: 0.74,
          observation: '眼下見到明顯淚溝陰影，屬結構型而非色素型。',
          location: '雙側眼下',
        },
        {
          key: 'temple_hollow',
          severity: 45,
          confidence: 0.66,
          observation: '太陽穴輕度凹陷，令上面部輪廓唔夠飽滿。',
          location: '雙側顳部',
        },
        {
          key: 'glabellar_lines',
          severity: 48,
          confidence: 0.78,
          observation: '眉心見到兩條垂直紋，靜態時仍然可見。',
          location: '眉心',
        },
      ],
      overallSummary:
        '你嘅老化屬混合型 —— 同時有鬆弛同容積流失，兩者互相加重。中面部凹陷令法令紋加深，而唔係法令紋本身嘅問題；單純填法令紋通常效果唔理想，要由中面部支撐做起先啱。眼下淚溝屬結構型陰影，唔係色素問題。',
      redFlags: [],
    },
  },
  {
    id: 'lines',
    label: '38 歲 · 動態紋同眼周',
    matches: ['smooth_lines', 'eye_area'],
    analysis: {
      imageQuality: { usable: true, lighting: 'good', issues: [], makeupDetected: false },
      structure: {
        faceShape: 'oval',
        faceShapeNote: '鵝蛋面，輪廓比例良好，鬆弛程度輕微，重點應該放喺表情紋同眼周。',
        symmetryScore: 85,
        agingPattern: 'minimal',
        estimatedSkinType: 'III',
      },
      findings: [
        {
          key: 'glabellar_lines',
          severity: 68,
          confidence: 0.86,
          observation: '眉心兩條垂直紋，靜態時仍然清晰可見，屬習慣性皺眉造成。',
          location: '眉心',
        },
        {
          key: 'forehead_lines',
          severity: 60,
          confidence: 0.84,
          observation: '額頭有三至四條橫向紋，抬眉時明顯加深。',
          location: '額頭',
        },
        {
          key: 'crows_feet',
          severity: 57,
          confidence: 0.82,
          observation: '眼尾放射狀細紋，笑起身明顯，靜態時仍見輕微痕跡。',
          location: '雙側眼尾',
        },
        {
          key: 'tear_trough',
          severity: 54,
          confidence: 0.75,
          observation: '眼下見到淚溝凹陷造成嘅陰影，屬結構型而非色素型。',
          location: '雙側眼下',
        },
        {
          key: 'dark_circles',
          severity: 48,
          confidence: 0.62,
          observation: '眼下偏暗，部分來自淚溝陰影，亦可能有血管型成分；相片難以完全分辨。',
          location: '雙側眼下',
        },
        {
          key: 'dehydration',
          severity: 42,
          confidence: 0.7,
          observation: '眼周同面頰有幼細乾紋，光澤度偏低。',
          location: '眼周、面頰',
        },
      ],
      overallSummary:
        '你嘅主要問題係表情造成嘅動態紋 —— 眉心、額頭同眼尾，呢啲同肌肉活動有關，唔係鬆弛。眼下嘅暗沉主要來自淚溝陰影（結構型），單靠美白產品幫唔到。面部輪廓同緊緻度仍然良好，暫時唔需要考慮提升類療程。',
      redFlags: [],
    },
  },
  {
    id: 'redflag',
    label: '需要轉介（紅旗示範）',
    matches: [],
    analysis: {
      imageQuality: { usable: true, lighting: 'good', issues: [], makeupDetected: true },
      structure: {
        faceShape: 'round',
        faceShapeNote: '圓面，面部脂肪分佈較平均，輪廓線條柔和。',
        symmetryScore: 86,
        agingPattern: 'minimal',
        estimatedSkinType: 'IV',
      },
      findings: [
        {
          key: 'pigmentation',
          severity: 44,
          confidence: 0.35,
          observation: '見到散在色素斑點，但相片有化妝遮蓋，實際程度好可能被低估。',
          location: '雙側面頰',
        },
        {
          key: 'texture',
          severity: 38,
          confidence: 0.3,
          observation: '化妝影響下難以準確評估膚質。',
          location: '整體',
        },
      ],
      overallSummary:
        '相片有化妝，色素同膚質嘅判斷準確度有限，建議素顏重拍。另外喺左面頰觀察到一個外觀需要留意嘅色素病灶，呢個唔屬於醫學美容範疇，請優先安排皮膚科檢查。',
      redFlags: [
        '左面頰有一個邊界不規則、顏色深淺不均嘅色素病灶（直徑約 7mm），建議盡快由皮膚科醫生檢查。呢個並非診斷，但呢類外觀特徵需要專業評估先可以排除。',
      ],
    },
  },
];

/**
 * 按客人揀嘅目標揀最貼題嘅個案；冇揀就用色斑個案。
 *
 * 平手時**專一度高嘅贏** —— 涵蓋範圍窄嘅個案（例如淨係針對動態紋同眼周）
 * 比一個乜都沾少少嘅老化個案更能示範「揀唔同目標會出唔同建議」。
 * 之前用陣列次序做隱含 tie-break，結果排頭嗰個永遠贏，令新加嘅專門個案
 * 完全揀唔到。
 */
export function pickDemoCase(goals: GoalKey[], forceId?: string): DemoCase {
  if (forceId) {
    const forced = DEMO_CASES.find((c) => c.id === forceId);
    if (forced) return forced;
  }
  if (goals.length === 0) return DEMO_CASES[1];

  let best = DEMO_CASES[1];
  let bestHits = -1;
  let bestBreadth = Infinity;
  for (const c of DEMO_CASES) {
    const hits = c.matches.filter((m) => goals.includes(m)).length;
    if (hits > bestHits || (hits === bestHits && hits > 0 && c.matches.length < bestBreadth)) {
      bestHits = hits;
      bestBreadth = c.matches.length;
      best = c;
    }
  }
  return best;
}
