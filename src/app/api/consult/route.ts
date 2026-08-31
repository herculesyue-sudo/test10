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
import { checkRateLimit, recordUsage, usageSnapshot, clientIp } from '@/lib/ratelimit';
import { computeCategoryScores } from '@/lib/categories';
import { getVisitStore, normalizePhone, normalizeHKMobile, type VisitRecord } from '@/lib/visits';
import { checkStaff, STAFF_COOKIE } from '@/lib/staff-auth';
import { getQuotaStore, phoneKey, FREE_ANALYSES_PER_PHONE } from '@/lib/phone-quota';
import { getLeadStore, type LeadRecord } from '@/lib/leads';
import { getSpendStore, monthKey, monthlyBudgetHKD } from '@/lib/ai-budget';
import { verifyTurnstile } from '@/lib/turnstile';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 測試模式：唔呼叫 API、唔使 key、零成本。喺 .env 設 DEMO_MODE=1 開啟。 */
const DEMO = process.env.DEMO_MODE === '1' || process.env.DEMO_MODE === 'true';

function isStaffRequest(req: Request): boolean {
  const cookie = /(?:^|;\s*)drt_staff=([^;]+)/.exec(req.headers.get('cookie') ?? '')?.[1];
  void STAFF_COOKIE; // cookie 名同 staff-auth 一致（regex 內冇辦法用常量）
  return checkStaff(null, cookie ? decodeURIComponent(cookie) : undefined).action === 'allow';
}

/** 前端用嚟知道而家係咪測試模式（顯示橫額、跳過影相、揀個案）。 */
export async function GET(req: Request) {
  const base: Record<string, unknown> = {
    demo: DEMO,
    cases: DEMO ? DEMO_CASES.map((c) => ({ id: c.id, label: c.label })) : [],
    usage: usageSnapshot(),
  };

  // 本月使費只俾職員睇（BudgetBanner）—— 預算數字唔應該公開俾客人端
  if (isStaffRequest(req)) {
    try {
      const s = await getSpendStore().month(monthKey());
      const budgetHKD = monthlyBudgetHKD();
      base.budget = {
        monthSpentHKD: Number(s.costHKD.toFixed(2)),
        budgetHKD,
        analyses: s.analyses,
        pctUsed: Number(((s.costHKD / budgetHKD) * 100).toFixed(1)),
      };
    } catch {
      /* 資料庫暫時攞唔到就唔出橫額，唔好整死成個 GET */
    }
  }
  return NextResponse.json(base);
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
  /** 客人電話（必填，除非 demo / 職員）—— 計每電話 3 次額度；剔咗同意先會以原文入跟進名單 */
  customerPhone?: string;
  /** 客人稱呼（可選）—— 入跟進名單＋傳送報告嗰陣帶埋 */
  customerName?: string;
  /** 客人必須同意（保存分析摘要＋WhatsApp 跟進）先可以分析 —— ContactCard 嘅必剔方格 */
  consent?: boolean;
  /** Cloudflare Turnstile token（伺服器設定咗 TURNSTILE_SECRET_KEY 先會查） */
  turnstileToken?: string;
  /** 廣告來源標記（前端由 URL 攞）—— server 會消毒先落 lead */
  utm?: string;
  /** 職員 /pro 嘅自願儲存流程（SaveRecordCard staffMode）。客人流程唔再用呢個 —— 改行必須同意自動儲。 */
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
 * 有同意先至儲；一切由 server 自己計自己寫 —— 冇公開寫入口。
 *
 * 客人流程：ContactCard 嘅必剔同意（consent + customerPhone）；
 * 職員 /pro：SaveRecordCard 嘅自願流程（body.record）。source 由 server
 * 判斷（staff cookie），唔信 client 自報。findings 喺呢個邊界剝走
 * observation / location —— 同 stripInternal 同一個原則。
 */
async function maybeSaveVisit(
  recordReq: { phone?: string; consent?: boolean } | undefined,
  isStaff: boolean,
  body: Body,
  findings: Finding[],
  goals: GoalKey[],
): Promise<{ saved: boolean; persistent: boolean; reason?: string } | undefined> {
  if (!recordReq?.consent || !recordReq.phone) return undefined; // 冇同意 = 乜都唔儲

  let persistent = false;
  try {
    const store = await getVisitStore();
    persistent = store.persistent;

    const phone = normalizePhone(recordReq.phone);
    if (!phone) return { saved: false, persistent, reason: '電話號碼格式唔啱' };

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

/**
 * 跟進名單寫入（拉新客漏斗嘅落點）—— 客人剔咗必須同意先會行到呢度。
 * 寫入失敗唔可以整死個報告：分析結果照出，lead 冇咗一筆係損失，
 * 但客人白等 30 秒先係災難。
 */
async function saveLead(
  phone: string,
  name: string | undefined,
  goals: GoalKey[],
  findings: Finding[],
  utm: string | undefined,
): Promise<void> {
  try {
    const top = [...findings]
      .sort((a, b) => b.severity - a.severity)
      .slice(0, 3)
      .map((f) => ({ key: f.key, severity: f.severity }));
    const lead: LeadRecord = {
      id: crypto.randomUUID(),
      phone,
      name: name?.trim() || undefined,
      createdAt: new Date().toISOString(),
      goals,
      topFindings: top,
      status: 'new',
      source: 'customer',
      utm,
    };
    await getLeadStore().add(lead);
  } catch (err) {
    console.error('[consult] lead 寫入失敗:', (err as Error).message);
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
    // 喺未部署之前就測試得到（demo 冇 ContactCard，行職員 record 流程）
    const demoRecord = await maybeSaveVisit(body.record, isStaffRequest(req), body, findings, goals);
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
  // tier / passes 只准職員自選：呢兩個參數直接決定每次分析嘅成本，
  // 公開俾人揀等於開個後門俾人用 max+5 passes 燒穿每月預算，令真客
  // 全部見「名額用晒」。客人一律行伺服器設定（wrangler vars CONSULT_TIER）。
  const isStaffReq = isStaffRequest(req);
  const envTier: Tier = process.env.CONSULT_TIER && process.env.CONSULT_TIER in TIERS ? (process.env.CONSULT_TIER as Tier) : 'balanced';
  const tier: Tier = isStaffReq && body.tier && body.tier in TIERS ? body.tier : envTier;
  const envPasses = Math.min(Math.max(Number(process.env.CONSULT_PASSES ?? 1), 1), 5);
  const passes = isStaffReq ? Math.min(Math.max(body.passes ?? envPasses, 1), 5) : envPasses;

  const goalLabels = goals.map((g) => GOALS.find((x) => x.key === g)!.label);

  // ── 客人閘（職員 /pro 有 staff cookie，全部豁免）──
  // 順序有講究：同意 → 手機格式（免費、即答）→ Turnstile（免費，擋機械人）
  // → 每電話 3 次額度 → 月度預算。全部過晒先准佢燒真錢。
  // 額度同使費都係**分析成功之後**先入帳 —— 失敗唔燒客人條數。
  let quotaKey: string | null = null;
  let customerPhone: string | null = null;
  if (!isStaffReq) {
    if (!body.consent) {
      return bad('請先剔「同意保存分析紀錄同 WhatsApp 跟進」先可以開始分析');
    }
    customerPhone = normalizeHKMobile(body.customerPhone ?? '');
    if (!customerPhone) {
      return bad('請輸入香港手機號碼（4、5、6、7、9 字頭嘅 8 位數字）先可以開始分析');
    }

    const ts = await verifyTurnstile(body.turnstileToken, clientIp(req));
    if (!ts.ok) return bad(ts.reason ?? '安全驗證失敗，請重試。', 403);

    quotaKey = phoneKey(customerPhone);
    const usedSoFar = await getQuotaStore().used(quotaKey);
    if (usedSoFar >= FREE_ANALYSES_PER_PHONE) {
      return bad(
        `呢個電話已經用晒 ${FREE_ANALYSES_PER_PHONE} 次免費分析。想深入啲，歡迎直接 WhatsApp 6484 3111 預約醫生面診 —— 面診先係最準嘅評估。`,
        429,
      );
    }

    // ── 月度預算硬上限 ──「最壞情況蝕幾多」由呢層鎖死（記憶體
    // ratelimit 喺 Workers 每個 isolate 會重置，靠唔住）。讀唔到預算
    // 唔擋客 —— 呢層係保護傘，唔係命脈。
    try {
      const spent = (await getSpendStore().month(monthKey())).costHKD;
      if (spent >= monthlyBudgetHKD()) {
        return bad(
          '今個月嘅免費分析名額已經用晒。想評估膚況，歡迎 WhatsApp 6484 3111 直接預約 —— 醫生面診先係最準嘅評估。',
          503,
        );
      }
    } catch {
      /* fail-open */
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

    // ── 使費入帳（職員都計 —— 條數一樣係錢）──
    try {
      await getSpendStore().add(monthKey(), result.costHKD, result.usage.inputTokens, result.usage.outputTokens);
    } catch (err) {
      console.error('[consult] 使費入帳失敗:', (err as Error).message);
    }

    // 客人：必須同意已喺入口驗過 → 自動儲 visit（評分對比）＋ lead（跟進名單）
    // 職員：照舊行 SaveRecordCard 嘅自願 record 流程
    const recordReq = isStaffReq ? body.record : { phone: customerPhone ?? undefined, consent: true };
    const record = await maybeSaveVisit(recordReq, isStaffReq, body, findings, goals);
    if (!isStaffReq && customerPhone) {
      // utm 消毒：只留字母數字同 -_/.，最多 64 字元 —— 呢個值會喺後台顯示，唔好俾人塞嘢入嚟
      const utm = (body.utm ?? '').replace(/[^\w\-\/.]/g, '').slice(0, 64) || undefined;
      await saveLead(customerPhone, body.customerName, goals, findings, utm);
    }

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
