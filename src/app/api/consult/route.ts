import { NextResponse } from 'next/server';
import { analyzeWithConsensus, TIERS, type ImageInput, type Tier } from '@/lib/anthropic';
import { postProcess, usabilityVerdict } from '@/lib/postprocess';
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
import { checkRateLimit, recordUsage, usageSnapshot } from '@/lib/ratelimit';
import { computeCategoryScores } from '@/lib/categories';
import { getVisitStore, normalizePhone, type VisitRecord } from '@/lib/visits';
import { checkStaff, STAFF_COOKIE } from '@/lib/staff-auth';
import { getQuotaStore, phoneKey, FREE_ANALYSES_PER_PHONE } from '@/lib/phone-quota';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 測試模式：唔呼叫 API、唔使 key、零成本。喺 .env 設 DEMO_MODE=1 開啟。 */
const DEMO = process.env.DEMO_MODE === '1' || process.env.DEMO_MODE === 'true';

/** 前端用嚟知道而家係咪測試模式（顯示橫額、跳過影相、揀個案）。 */
export async function GET() {
  return NextResponse.json({
    demo: DEMO,
    cases: DEMO ? DEMO_CASES.map((c) => ({ id: c.id, label: c.label })) : [],
    usage: usageSnapshot(),
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
  /** 客人電話（必填，除非 demo / 職員）—— 用嚟計每電話 3 次免費額度，唔會以原文儲存 */
  customerPhone?: string;
  /** 客人稱呼（可選）—— 傳送報告嗰陣帶埋，方便診所跟進 */
  customerName?: string;
  /** 自願儲存評分紀錄（SaveRecordCard）。冇 consent 或者冇 phone 就乜都唔會儲。 */
  record?: { phone?: string; consent?: boolean };
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

/**
 * 客人自願同意先至儲；一切由 server 自己計自己寫 —— 冇公開寫入口。
 *
 * source 由 server 判斷（有有效 drt_staff cookie = 職員喺 /pro 代做），
 * 唔信 client 自報。findings 喺呢個邊界剝走 observation / location ——
 * 同 stripInternal 同一個原則：唔想儲嘅嘢就唔好俾佢入到 store。
 */
async function maybeSaveVisit(
  req: Request,
  body: Body,
  findings: Finding[],
  goals: GoalKey[],
): Promise<{ saved: boolean; persistent: boolean; reason?: string } | undefined> {
  if (!body.record?.consent || !body.record.phone) return undefined; // 冇要求過 = 乜都唔儲（現狀）

  let persistent = false;
  try {
    const store = await getVisitStore();
    persistent = store.persistent;

    const phone = normalizePhone(body.record.phone);
    if (!phone) return { saved: false, persistent, reason: '電話號碼格式唔啱' };

    const cookie = /(?:^|;\s*)drt_staff=([^;]+)/.exec(req.headers.get('cookie') ?? '')?.[1];
    const isStaff = checkStaff(null, cookie ? decodeURIComponent(cookie) : undefined).action === 'allow';
    void STAFF_COOKIE; // cookie 名同 staff-auth 一致（regex 內冇辦法用常量）

    const ageBand =
      body.age !== undefined
        ? body.age < 30 ? '20s' : body.age < 40 ? '30s' : body.age < 50 ? '40s' : body.age < 60 ? '50s' : '60+'
        : undefined;

    const visit: VisitRecord = {
      id: crypto.randomUUID(),
      phone,
      createdAt: new Date().toISOString(),
      source: isStaff ? 'pro' : 'customer',
      ageBand,
      goals,
      categoryScores: computeCategoryScores(findings).map((c) => ({
        key: c.key,
        score: c.score,
        lowConfidence: c.lowConfidence,
      })),
      findings: findings.map((f) => ({ key: f.key, severity: f.severity, confidence: f.confidence })),
    };
    await store.save(visit);
    return { saved: true, persistent };
  } catch {
    return { saved: false, persistent, reason: '儲存失敗' };
  }
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

    // 示範數據都要行埋後處理同可用性判斷 —— 否則「測試版 = 正式版除咗
    // 唔叫 AI」呢個承諾就唔成立，測試版會睇唔到真實嘅守門行為。
    const demoAnalysis = postProcess(demoCase.analysis).analysis;
    const demoUsability = usabilityVerdict(demoAnalysis);

    const findings: Finding[] = demoAnalysis.findings.map((f) => ({
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
    // demo 都行真嘅儲存流程（記憶體 store）—— 成個「儲存→/records 搜尋」
    // 喺未部署之前就測試得到
    const demoRecord = await maybeSaveVisit(req, body, findings, goals);
    return NextResponse.json({
      analysis: demoAnalysis,
      record: demoRecord,
      recommendations: demoShown,
      goalCoverage: goalCoverage(goals, demoShown),
      usability: demoUsability,
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

  // ── 速率限制 ──
  // 放喺相片驗證之後：格式錯嘅請求唔應該食客人額度，但要喺呼叫 API 之前，
  // 因為呢個 endpoint 每次呼叫都真金白銀。
  const limit = checkRateLimit(req);
  if (!limit.ok) {
    return NextResponse.json(
      { error: limit.reason },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec ?? 3600) } },
    );
  }
  recordUsage(req);

  // ── 驗證其他輸入 ──
  const tier: Tier = body.tier && body.tier in TIERS ? body.tier : ((process.env.CONSULT_TIER as Tier) ?? 'balanced');
  const passes = Math.min(Math.max(body.passes ?? Number(process.env.CONSULT_PASSES ?? 1), 1), 5);

  const goalLabels = goals.map((g) => GOALS.find((x) => x.key === g)!.label);

  // ── 每電話 3 次免費額度 ──
  // 職員（/pro，有 staff cookie）唔受限 —— 佢哋喺舖頭代客做，唔應該俾
  // 額度卡住。客人一定要有電話先做到；額度喺**分析成功之後**先扣，
  // 失敗嘅請求唔應該燒客人條數。
  const staffCookie = /(?:^|;\s*)drt_staff=([^;]+)/.exec(req.headers.get('cookie') ?? '')?.[1];
  const isStaffReq = checkStaff(null, staffCookie ? decodeURIComponent(staffCookie) : undefined).action === 'allow';
  let quotaKey: string | null = null;
  if (!isStaffReq) {
    const customerPhone = normalizePhone(body.customerPhone ?? '');
    if (!customerPhone) return bad('請輸入 8 位香港電話號碼先可以開始分析');
    quotaKey = phoneKey(customerPhone);
    const usedSoFar = await getQuotaStore().used(quotaKey);
    if (usedSoFar >= FREE_ANALYSES_PER_PHONE) {
      return bad(
        `呢個電話已經用晒 ${FREE_ANALYSES_PER_PHONE} 次免費分析。想深入啲，歡迎直接 WhatsApp 6484 3111 預約醫生面診 —— 面診先係最準嘅評估。`,
        429,
      );
    }
  }

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
    const record = await maybeSaveVisit(req, body, findings, goals);

    // 分析成功先扣額度（失敗唔燒客人條數）
    let remainingAnalyses: number | undefined;
    if (quotaKey) {
      const used = await getQuotaStore().increment(quotaKey);
      remainingAnalyses = Math.max(0, FREE_ANALYSES_PER_PHONE - used);
    }

    return NextResponse.json({
      analysis: result.analysis,
      record,
      recommendations: shown,
      goalCoverage: goalCoverage(goals, shown),
      // 相片唔夠好嘅時候要照講。之前 usable:false 係計咗出嚟但冇人理 ——
      // 系統照樣出一份睇落好肯定嘅報告，客人冇任何線索知道唔可信。
      usability: result.usability,
      plan: plan.map(stripPlanInternal),
      meta: {
        model: result.model,
        tier,
        tierLabel: TIERS[tier].label,
        passes: result.passes,
        usage: result.usage,
        costHKD: Number(result.costHKD.toFixed(3)),
        pricingEnabled: PRICING_ENABLED,
        // 後處理改咗幾多嘢。持續唔係 0 代表個模型開始唔跟指示，
        // 應該去 eval 睇下係咪要調 prompt —— 唔會顯示俾客人。
        adjustments: result.adjustments.length,
        // undefined = 職員／demo（冇額度概念）
        remainingAnalyses,
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
