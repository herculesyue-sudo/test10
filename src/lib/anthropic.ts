import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AnalysisSchema, type Analysis } from './schema';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';

export type Tier = 'budget' | 'balanced' | 'max';

interface TierConfig {
  model: string;
  label: string;
  /** 每百萬 token 美元價（Anthropic 官方牌價） */
  usdPerMTok: { input: number; output: number };
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  adaptiveThinking: boolean;
  maxTokens: number;
  note: string;
}

/**
 * 三個成本層級。
 *
 * 「最平」同「最準」係對立嘅，所以呢度做成可切換，唔係二揀一：
 * 篩選／自助查詢行 budget，客人真係要落單前行 balanced 或 max。
 * 實測成本會即時計出嚟並顯示喺報告底部。
 */
export const TIERS: Record<Tier, TierConfig> = {
  budget: {
    model: 'claude-haiku-4-5',
    label: '經濟模式',
    usdPerMTok: { input: 1, output: 5 },
    adaptiveThinking: false,
    maxTokens: 8000,
    note: '最平。適合大量初步篩選、免費體驗版。細節捕捉會弱啲。',
  },
  balanced: {
    model: 'claude-sonnet-5',
    // 牌價 $3/$15（2026-08-31 前有 $2/$10 推廣價）。用牌價估算避免低估預算。
    usdPerMTok: { input: 3, output: 15 },
    label: '推薦模式',
    effort: 'high',
    adaptiveThinking: true,
    maxTokens: 16000,
    note: '準確度同成本嘅平衡點，日常營運建議用呢個。',
  },
  max: {
    model: 'claude-opus-5',
    label: '最高準確度',
    usdPerMTok: { input: 5, output: 25 },
    effort: 'xhigh',
    adaptiveThinking: true,
    maxTokens: 24000,
    note: '最強視覺推理。留返俾複雜個案、VIP 客、或者要出正式報告嗰陣。',
  },
};

export const USD_TO_HKD = 7.8;

let _client: Anthropic | null = null;
export function client(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('未設定 ANTHROPIC_API_KEY。請複製 .env.example 做 .env 並填入 API key。');
    }
    _client = new Anthropic();
  }
  return _client;
}

export interface ImageInput {
  /** base64（唔含 data: 前綴） */
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** front / left / right */
  angle: string;
}

export interface AnalyzeOptions {
  images: ImageInput[];
  goals: string[];
  notes?: string;
  age?: number;
  gender?: string;
  tier: Tier;
}

export interface AnalyzeResult {
  analysis: Analysis;
  usage: { inputTokens: number; outputTokens: number };
  costHKD: number;
  model: string;
  passes: number;
}

function costOf(tier: Tier, inTok: number, outTok: number): number {
  const p = TIERS[tier].usdPerMTok;
  return ((inTok / 1e6) * p.input + (outTok / 1e6) * p.output) * USD_TO_HKD;
}

/** 單次分析。 */
export async function analyzeOnce(opts: AnalyzeOptions): Promise<AnalyzeResult> {
  const cfg = TIERS[opts.tier];

  const content: Anthropic.ContentBlockParam[] = [];
  for (const img of opts.images) {
    content.push({ type: 'text', text: `【${img.angle}】` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.data },
    });
  }
  content.push({
    type: 'text',
    text: buildUserPrompt({ goals: opts.goals, notes: opts.notes, age: opts.age, gender: opts.gender }),
  });

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    // 系統提示長期不變 → 設 cache breakpoint，重複請求慳約 90% input 成本
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
    output_config: {
      format: zodOutputFormat(AnalysisSchema),
      ...(cfg.effort ? { effort: cfg.effort } : {}),
    },
    ...(cfg.adaptiveThinking ? { thinking: { type: 'adaptive' as const } } : {}),
  };

  const msg = await client().messages.parse(params);

  if (msg.stop_reason === 'refusal') {
    throw new Error('模型基於安全政策拒絕處理呢張相。請確認相片內容並重試。');
  }
  if (!msg.parsed_output) {
    throw new Error('模型輸出未能解析成預期格式，請重試。');
  }

  const inTok = msg.usage.input_tokens + (msg.usage.cache_creation_input_tokens ?? 0);
  const cacheRead = msg.usage.cache_read_input_tokens ?? 0;

  return {
    analysis: msg.parsed_output,
    usage: { inputTokens: inTok + cacheRead, outputTokens: msg.usage.output_tokens },
    // 快取讀取只收約 10%
    costHKD: costOf(opts.tier, inTok + cacheRead * 0.1, msg.usage.output_tokens),
    model: cfg.model,
    passes: 1,
  };
}

/**
 * 多次獨立分析取共識（self-consistency）。
 *
 * 單次視覺判斷嘅方差主要嚟自邊緣個案（輕微色斑、早期鬆弛）。跑 N 次再取
 * 中位數，可以壓低方差、而且「有幾多次跑出同一個 finding」本身就係一個
 * 比模型自報 confidence 更可靠嘅信心指標 —— 呢個就係 agreement 欄位。
 *
 * 代價係成本乘以 N，所以預設 1 次；診所可以喺重要個案先開。
 */
export async function analyzeWithConsensus(opts: AnalyzeOptions, passes: number): Promise<AnalyzeResult> {
  if (passes <= 1) return analyzeOnce(opts);

  const runs = await Promise.all(Array.from({ length: passes }, () => analyzeOnce(opts)));

  const byKey = new Map<string, { sev: number[]; conf: number[]; obs: string[]; loc: string[] }>();
  for (const r of runs) {
    for (const f of r.analysis.findings) {
      const e = byKey.get(f.key) ?? { sev: [], conf: [], obs: [], loc: [] };
      e.sev.push(f.severity);
      e.conf.push(f.confidence);
      e.obs.push(f.observation);
      e.loc.push(f.location);
      byKey.set(f.key, e);
    }
  }

  const median = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const merged: Analysis['findings'] = [];
  for (const [key, e] of byKey) {
    const agreement = e.sev.length / passes;
    // 少於一半次數先出現嘅 finding 當雜訊丟棄
    if (agreement < 0.5) continue;
    merged.push({
      key: key as Analysis['findings'][number]['key'],
      severity: Math.round(median(e.sev)),
      // 用「跨次一致率」調整信心：跑幾次都見到 = 真實訊號
      confidence: Math.min(1, median(e.conf) * (0.6 + 0.4 * agreement)),
      observation: e.obs[0],
      location: e.loc[0],
    });
  }
  merged.sort((a, b) => b.severity * b.confidence - a.severity * a.confidence);

  const base = runs[0];
  return {
    analysis: { ...base.analysis, findings: merged },
    usage: {
      inputTokens: runs.reduce((s, r) => s + r.usage.inputTokens, 0),
      outputTokens: runs.reduce((s, r) => s + r.usage.outputTokens, 0),
    },
    costHKD: runs.reduce((s, r) => s + r.costHKD, 0),
    model: base.model,
    passes,
  };
}
