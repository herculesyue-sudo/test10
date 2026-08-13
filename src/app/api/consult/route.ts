import { NextResponse } from 'next/server';
import { analyzeWithConsensus, TIERS, type ImageInput, type Tier } from '@/lib/anthropic';
import { matchTreatments, buildPhasedPlan, GOALS, type Finding, type GoalKey } from '@/lib/treatments';

export const runtime = 'nodejs';
export const maxDuration = 300;

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
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return bad('請求格式錯誤');
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
  const validGoalKeys = new Set(GOALS.map((g) => g.key));
  const goals = (body.goals ?? []).filter((g): g is GoalKey => validGoalKeys.has(g as GoalKey));

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

    return NextResponse.json({
      analysis: result.analysis,
      recommendations: scored.slice(0, 10),
      plan,
      meta: {
        model: result.model,
        tier,
        tierLabel: TIERS[tier].label,
        passes: result.passes,
        usage: result.usage,
        costHKD: Number(result.costHKD.toFixed(3)),
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
