import * as z from 'zod/v4';
import { FINDING_LABELS } from './treatments/types';

const FINDING_KEYS = Object.keys(FINDING_LABELS) as [string, ...string[]];

/**
 * AI 只可以輸出「觀察」，唔可以輸出療程名。
 * 咁樣做有三個好處：
 *   1. 療程建議由本地規則引擎產生 → 可審計、可俾醫生改、唔會幻覺出唔存在嘅療程
 *   2. 療程價格同規管資訊唔會受模型訓練資料過時影響
 *   3. 換模型／換供應商唔使重寫療程邏輯
 */
export const FindingSchema = z.object({
  key: z.enum(FINDING_KEYS).describe('特徵代號，必須係列表入面其中一個'),
  severity: z.number().min(0).max(100).describe('嚴重程度 0-100。0=完全觀察唔到，30=輕微，60=中度，85+=顯著'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('你對呢個判斷嘅信心 0-1。相片光線差、角度唔啱、解像度低都要調低信心'),
  observation: z.string().describe('用廣東話具體描述你喺相片睇到咩，唔好用診斷術語落定論'),
  location: z.string().describe('大致位置，例如「左邊顴骨」「額頭正中」「雙側下頜」。無明確位置就寫「整體」'),
});

export const ImageQualitySchema = z.object({
  usable: z.boolean().describe('相片係咪足夠清晰去做分析'),
  lighting: z.enum(['good', 'fair', 'poor']).describe('光線質素'),
  issues: z.array(z.string()).describe('影響判斷嘅問題，例如「戴住眼鏡」「化咗妝」「側面角度太大」「有陰影」。無問題就空陣列'),
  makeupDetected: z.boolean().describe('係咪化咗妝（化妝會遮蓋色斑同泛紅，嚴重影響膚質判斷）'),
});

export const FacialStructureSchema = z.object({
  faceShape: z
    .enum(['oval', 'round', 'square', 'heart', 'long', 'diamond', 'uncertain'])
    .describe('面形分類；判斷唔到就揀 uncertain'),
  faceShapeNote: z.string().describe('用廣東話講面形特徵同對輪廓建議嘅影響'),
  symmetryScore: z.number().min(0).max(100).describe('左右對稱度 0-100，100 = 完全對稱'),
  agingPattern: z
    .enum(['volume_loss', 'laxity', 'photoaging', 'mixed', 'minimal'])
    .describe('主要老化模式：容積流失 / 鬆弛 / 光老化 / 混合 / 輕微'),
  estimatedSkinType: z
    .enum(['I', 'II', 'III', 'IV', 'V', 'VI', 'uncertain'])
    .describe('Fitzpatrick 皮膚類型；影響激光參數同反黑風險'),
});

export const AnalysisSchema = z.object({
  imageQuality: ImageQualitySchema,
  structure: FacialStructureSchema,
  findings: z.array(FindingSchema).describe('所有觀察到嘅特徵。冇觀察到嘅特徵唔好放入去，唔好夾硬砌夠數'),
  overallSummary: z.string().describe('用廣東話寫 2-3 句總結，寫俾客人睇，語氣專業但親切'),
  redFlags: z
    .array(z.string())
    .describe(
      '需要即刻轉介皮膚科醫生嘅可疑情況，例如形狀不規則／顏色不均／邊界模糊嘅痣、快速變化嘅病灶、潰瘍。' +
        '唔好下診斷，只係講「建議由醫生檢查」。冇就空陣列',
    ),
});

export type Analysis = z.infer<typeof AnalysisSchema>;
export type AnalysisFinding = z.infer<typeof FindingSchema>;
