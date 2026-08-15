import { NextResponse } from 'next/server';
import { analyzeWithConsensus, TIERS, type ImageInput, type Tier } from '@/lib/anthropic';
import {
  matchTreatments,
  buildPhasedPlan,
  GOALS,
  MIN_PRESENTABLE_SCORE,
  PRICING_ENABLED,
  type Finding,
  type GoalKey,
  type ScoredTreatment,
} from '@/lib/treatments';
import { pickDemoCase, DEMO_CASES } from '@/lib/demo';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 測試模式：唔呼叫 API、唔使 key、零成本。喺 .env 設 DEMO_MODE=1 開啟。 */
const DEMO = process.env.DEMO_MODE === '1' || process.env.DEMO_MODE === 'true';

/** 前端用嚟知道而家係咪測試模式（顯示橫額、跳過影相、揀個案）。 */
export async function GET() {
  return NextResponse.json({
    demo: DEMO,
    cases: DEMO ? DEMO_CASES.map((c) => ({ id: c.id, label: c.label })) : [],
  });
}

const MAX_IMAGES = 4;
const MAX_BYTES_PER_IMAGE = 6 * 1024 * 1024;
const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp'] as const;

interface Body {
  images?: { data?: string; mediaType?: string; angle?: string }[];
  goals?: string[];
  notes?: string;
  age?: number;
  gender?: string;
  tier?: Tier;
  passes?: number;
  budgetHKD?: number;
  maxDowntimeDays?: number;
  noInjectables?: boolean;
  isPregnantOrNursing?: boolean;
  /** 測試模式：指定用邊個示範個案 */
  demoCaseId?: string;
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

/**
 * 只交夠分嘅推薦俾前端，同時剝走內部備註。
 *
 * 低分配對唔應該以「建議」嘅身份出現喺客人面前；而 internalNote 就算前端唔
 * render，留喺 JSON 入面一樣係開 devtools 就睇到 —— 要喺 API 邊界剝走先算數。
 */
function presentable(scored: ScoredTreatment[]) {
  return scored
    .filter((s) => s.score >= MIN_PRESENTABLE_SCORE)
    .slice(0, 10)
    .map(stripInternal);
}

function stripInternal(s: ScoredTreatment): ScoredTreatment {
  const { internalNote: _omit, ...publicTreatment } = s.treatment;
  return { ...s, treatment: publicTreatment };
}

function stripPlanInternal<T extends { items: ScoredTreatment[] }>(p: T): T {
  return { ...p, items: p.items.map(stripInternal) };
}

/**
 * 客人揀咗嘅目標，有邊啲真係有建議覆蓋到。
 *
 * 冇覆蓋唔一定係壞事 —— 可能相片睇唔到相關問題，可能診所暫時冇對應療程。
 * 但客人揀咗「眼周改善」而第一個建議係蘋果肌填充嘅時候，唔講一聲就好似
 * 冇聽佢講嘢。講清楚反而更可信。
 */
function goalCoverage(goals: GoalKey[], shown: ScoredTreatment[]) {
  const hit = new Set(shown.flatMap((s) => s.targets.map((t) => t.key)));
  return goals.map((g) => {
    const def = GOALS.find((x) => x.key === g)!;
    return { goal: g, label: def.label, covered: def.maps.some((k) => hit.has(k)) };
  });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return bad('請求格式錯誤');
  }

  const validGoalKeys = new Set(GOALS.map((g) => g.key));
  const goals = (body.goals ?? []).filter((g): g is GoalKey => validGoalKeys.has(g as GoalKey));

  // ── 測試模式：唔呼叫 API、唔使相片 ──
  // 假嘅只係「AI 睇相嘅結果」；下面嘅配對引擎、過濾、計價全部行真嘅邏輯，
  // 所以測試版睇到嘅推薦 = 正式版睇到嘅推薦。
  if (DEMO) {
    const demoCase = pickDemoCase(goals, body.demoCaseId);
    await new Promise((r) => setTimeout(r, 900)); // 模擬分析延遲，令 loading 畫面測得到

    const findings: Finding[] = demoCase.analysis.findings.map((f) => ({
      key: f.key as Finding['key'],
      severity: f.severity,
      confidence: f.confidence,
      observation: f.observation,
      location: f.location,
    }));

    const scored = matchTreatments({
      findings,
      goals,
      budgetHKD: body.budgetHKD,
      maxDowntimeDays: body.maxDowntimeDays,
      noInjectables: body.noInjectables,
      isPregnantOrNursing: body.isPregnantOrNursing,
    });

    const demoShown = presentable(scored);
    return NextResponse.json({
      analysis: demoCase.analysis,
      recommendations: demoShown,
      goalCoverage: goalCoverage(goals, demoShown),
      plan: buildPhasedPlan(scored).map(stripPlanInternal),
      meta: {
        model: '（測試模式 · 冇呼叫 AI）',
        tier: 'demo',
        tierLabel: '測試模式',
        passes: 0,
        usage: { inputTokens: 0, outputTokens: 0 },
        costHKD: 0,
        pricingEnabled: PRICING_ENABLED,
        demo: true,
        demoCaseId: demoCase.id,
        demoCaseLabel: demoCase.label,
      },
    });
  }

  // ── 驗證相片 ──
  const raw = body.images ?? [];
  if (raw.length === 0) return bad('請最少上載一張相片');
  if (raw.length > MAX_IMAGES) return bad(`最多 ${MAX_IMAGES} 張相片`);

  const images: ImageInput[] = [];
  for (const [i, img] of raw.entries()) {
    if (!img.data) return bad(`第 ${i + 1} 張相片冇資料`);
    if (!ALLOWED_MEDIA.includes(img.mediaType as (typeof ALLOWED_MEDIA)[number])) {
      return bad(`第 ${i + 1} 張相片格式唔支援（只接受 JPEG / PNG / WebP）`);
    }
    // base64 每 4 字元代表 3 bytes
    if ((img.data.length * 3) / 4 > MAX_BYTES_PER_IMAGE) {
      return bad(`第 ${i + 1} 張相片超過 6MB，請壓縮後再試`);
    }
    images.push({
      data: img.data,
      mediaType: img.mediaType as ImageInput['mediaType'],
      angle: img.angle || '相片',
    });
  }

  // ── 驗證其他輸入 ──
  const tier: Tier = body.tier && body.tier in TIERS ? body.tier : ((process.env.CONSULT_TIER as Tier) ?? 'balanced');
  const passes = Math.min(Math.max(body.passes ?? Number(process.env.CONSULT_PASSES ?? 1), 1), 5);

  const goalLabels = goals.map((g) => GOALS.find((x) => x.key === g)!.label);

  try {
    const result = await analyzeWithConsensus(
      {
        images,
        goals: goalLabels,
        notes: body.notes,
        age: body.age,
        gender: body.gender,
        tier,
      },
      passes,
    );

    const findings: Finding[] = result.analysis.findings.map((f) => ({
      key: f.key as Finding['key'],
      severity: f.severity,
      confidence: f.confidence,
      observation: f.observation,
      location: f.location,
    }));

    const scored = matchTreatments({
      findings,
      goals,
      budgetHKD: body.budgetHKD,
      maxDowntimeDays: body.maxDowntimeDays,
      noInjectables: body.noInjectables,
      isPregnantOrNursing: body.isPregnantOrNursing,
    });

    const plan = buildPhasedPlan(scored);

    const shown = presentable(scored);
    return NextResponse.json({
      analysis: result.analysis,
      recommendations: shown,
      goalCoverage: goalCoverage(goals, shown),
      plan: plan.map(stripPlanInternal),
      meta: {
        model: result.model,
        tier,
        tierLabel: TIERS[tier].label,
        passes: result.passes,
        usage: result.usage,
        costHKD: Number(result.costHKD.toFixed(3)),
        pricingEnabled: PRICING_ENABLED,
      },
    });
  } catch (err) {
    const e = err as { status?: number; message?: string; name?: string };
    console.error('[consult] 分析失敗:', e.name, e.message);

    if (e.status === 401) return bad('API key 無效，請檢查 ANTHROPIC_API_KEY', 500);
    if (e.status === 429) return bad('請求太頻密，請稍等再試', 429);
    if (e.status === 413) return bad('相片太大，請壓縮後再試', 413);
    if (e.status && e.status >= 500) return bad('AI 服務暫時繁忙，請稍後再試', 503);

    return bad(e.message ?? '分析失敗，請重試', 500);
  }
}
