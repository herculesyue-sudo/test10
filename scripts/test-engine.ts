/**
 * 療程配對引擎嘅離線測試（唔使 API key）。
 *
 * 用假嘅分析結果去驗證規則引擎：排序合唔合理、過濾有冇生效、
 * 分階段方案有冇將注射類擺去最後。呢啲係唔應該靠模型輸出去測嘅嘢。
 *
 * npm run test:engine
 */

import {
  matchTreatments,
  buildPhasedPlan,
  ALL_TREATMENTS,
  FINDING_LABELS,
  MIN_PRESENTABLE_SCORE,
  isPriceConfirmed,
  PRICING_ENABLED,
} from '../src/lib/treatments';
import { CLINIC_TREATMENTS } from '../src/lib/treatments/clinic';
import type { Finding, FindingKey } from '../src/lib/treatments';
import { buildBookingUrl } from '../src/lib/booking';
import { DEMO_CASES, pickDemoCase } from '../src/lib/demo';
import {
  checkRateLimit,
  recordUsage,
  usageSnapshot,
  clientIp,
  setRateLimitStore,
  createMemoryStore,
} from '../src/lib/ratelimit';
import {
  track,
  funnelSnapshot,
  conversionRates,
  setFunnelStore,
  createMemoryFunnel,
  FUNNEL_STEPS,
  STEP_LABELS,
} from '../src/lib/funnel';
import { trackStep, resetTracking } from '../src/lib/track-client';
import { postProcess, usabilityVerdict } from '../src/lib/postprocess';
import type { Analysis } from '../src/lib/schema';
import { analysePixels, THRESHOLDS } from '../src/lib/photo-check';
import { allowedOrigins, frameAncestors } from '../src/lib/embed-config';
import { checkStaff, isStaffPath } from '../src/lib/staff-auth';
import { computeCategoryScores, partitionCheck, CATEGORIES, bandOf } from '../src/lib/categories';
import { FACE_REGIONS, regionCoverageCheck, goalsFromFindings, buildConcernNotes } from '../src/lib/face-regions';
import { normalizePhone, createMemoryVisitStore, type VisitRecord } from '../src/lib/visits';
import { readFileSync } from 'node:fs';
import { classifyHost, resolvePublicUrl } from '../src/lib/public-url';
import { lanAddresses, lanUrl } from '../src/lib/lan-address';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const f = (key: FindingKey, severity: number, confidence = 0.85): Finding => ({
  key,
  severity,
  confidence,
  observation: '(測試)',
  location: '整體',
});

console.log('\n── 資料完整性 ──');
{
  const ids = ALL_TREATMENTS.map((t) => t.id);
  check('療程 id 無重複', new Set(ids).size === ids.length);
  check(`診所目錄有 ${ALL_TREATMENTS.length} 個療程（>0）`, ALL_TREATMENTS.length > 0);
  const badKey = ALL_TREATMENTS.flatMap((t) => t.indications).find((i) => !(i.key in FINDING_LABELS));
  check('所有適應症 key 都合法', !badKey, badKey ? `未知 key: ${badKey.key}` : '');
  // 已標 confirmed 嘅價錢必須合理；tbc 嘅可以係 0（UI 會顯示「請洽診所」）
  const badPrice = ALL_TREATMENTS.filter(isPriceConfirmed).find(
    (t) => t.priceHKD.min <= 0 || t.priceHKD.max < t.priceHKD.min,
  );
  check('已核實嘅價格區間合理', !badPrice, badPrice?.id);

  const unpriced = ALL_TREATMENTS.filter((t) => !isPriceConfirmed(t));
  if (unpriced.length) {
    console.log(`  ⚠️  ${unpriced.length}/${ALL_TREATMENTS.length} 個療程仲未有真實價錢（UI 會顯示「請洽診所」）`);
    console.log(`     ${unpriced.map((t) => t.id).join(', ')}`);
  }

  // 呢個係最重要嘅一條：引擎絕對唔可以推薦診所冇提供嘅療程
  const clinicIds = new Set(CLINIC_TREATMENTS.map((t) => t.id));
  check('引擎只認診所目錄（唔會推薦競爭對手療程）', ALL_TREATMENTS.every((t) => clinicIds.has(t.id)));
  const noContra = ALL_TREATMENTS.filter((t) => t.contraindications.length === 0);
  check('所有療程都有列禁忌', noContra.length === 0, noContra.map((t) => t.id).join(', '));

  // 覆蓋率而家係 33/33。改目錄嗰陣好易靜靜雞跌返落去 —— AI 會照樣指出
  // 個問題，但一個建議都出唔到，客人就會攞住呢個結果去第二間。
  const covered = new Set(ALL_TREATMENTS.flatMap((t) => t.indications.map((i) => i.key)));
  const uncovered = (Object.keys(FINDING_LABELS) as FindingKey[]).filter((k) => !covered.has(k));
  check(
    `AI 偵測得到嘅 ${Object.keys(FINDING_LABELS).length} 種特徵全部有療程覆蓋`,
    uncovered.length === 0,
    uncovered.map((k) => FINDING_LABELS[k]).join('、'),
  );
}

console.log('\n── 個案 A：34 歲，色斑 + 暗瘡印為主 ──');
{
  const out = matchTreatments({
    findings: [f('pigmentation', 70), f('pih', 60), f('texture', 45), f('pores', 35)],
    goals: ['brighten'],
  });
  console.log('  頭三名：', out.slice(0, 3).map((r) => `${r.treatment.name}(${r.score})`).join(' · '));
  check('有推薦結果', out.length > 0);
  check(
    '首選係色素類療程',
    ['hollywood-spectra', 'picolaser', 'laser-toning', 'sylfirm'].includes(out[0]?.treatment.id),
    out[0]?.treatment.id,
  );
  check('唔會推薦無關嘅溶脂療程', !out.slice(0, 3).some((r) => r.treatment.id.includes('lipolysis')));
}

console.log('\n── 個案 B：48 歲，鬆弛 + 容積流失 ──');
{
  const out = matchTreatments({
    findings: [
      f('skin_laxity', 75),
      f('jowls', 65),
      f('midface_volume_loss', 70),
      f('nasolabial_fold', 55),
      f('jawline_definition', 60),
    ],
    goals: ['lift', 'contour'],
  });
  console.log('  頭三名：', out.slice(0, 3).map((r) => `${r.treatment.name}(${r.score})`).join(' · '));
  const plan = buildPhasedPlan(out);
  check('有分階段方案', plan.length > 0);
  const injPhases = plan.filter((p) => p.items.some((i) => i.treatment.category === 'injectable')).map((p) => p.phase);
  check('注射類排喺後期階段', injPhases.every((p) => p >= 3), `出現喺階段 ${injPhases.join(',')}`);
  // 價錢未錄入時，小計應該係 0 而唔係亂報 —— UI 會顯示「請洽診所」
  const priced = plan.flatMap((p) => p.items).filter((i) => i.priceConfirmed);
  const totalMin = plan.reduce((s, p) => s + p.subtotalHKD.min, 0);
  check(
    priced.length ? '有價錢嘅療程會計入小計' : '未錄入價錢時小計為 0（唔會亂報價）',
    priced.length ? totalMin > 0 : totalMin === 0,
    `HK$${totalMin}`,
  );
}

console.log('\n── 個案 C：懷孕中（安全過濾） ──');
{
  const findings = [f('skin_laxity', 70), f('pigmentation', 60), f('masseter_hypertrophy', 65)];
  const normal = matchTreatments({ findings, goals: [] });
  const pregnant = matchTreatments({ findings, goals: [], isPregnantOrNursing: true });
  console.log(`  一般 ${normal.length} 項 → 懷孕 ${pregnant.length} 項`);
  check('推薦數量減少', pregnant.length < normal.length);
  check('完全排除激光', !pregnant.some((r) => r.treatment.family.includes('激光')));
  check('完全排除射頻', !pregnant.some((r) => r.treatment.family.includes('射頻')));
}

console.log('\n── 個案 D：唔想打針 ──');
{
  const out = matchTreatments({
    findings: [f('midface_volume_loss', 70), f('skin_laxity', 65), f('nasolabial_fold', 60)],
    goals: ['lift'],
    noInjectables: true,
  });
  console.log('  頭三名：', out.slice(0, 3).map((r) => r.treatment.name).join(' · '));
  check('完全冇注射類', out.every((r) => r.treatment.category !== 'injectable'));
  check('仍然有儀器類可選', out.length >= 2, `只有 ${out.length} 項`);
}

console.log('\n── 個案 E：低信心唔應該拉高分數 ──');
{
  // 揀一個目錄一定覆蓋到嘅特徵，令呢個測試唔會因為目錄改動而崩潰
  const covered = ALL_TREATMENTS[0].indications[0].key;
  const high = matchTreatments({ findings: [f(covered, 70, 0.9)], goals: [] });
  const low = matchTreatments({ findings: [f(covered, 70, 0.25)], goals: [] });
  console.log(`  信心 0.9 → ${high[0]?.score} 分 · 信心 0.25 → ${low[0]?.score} 分`);
  check('低信心分數明顯較低', low[0]!.score < high[0]!.score * 0.6);
}

console.log('\n── 個案 F：全部輕微（唔應該亂推薦） ──');
{
  const out = matchTreatments({ findings: [f('pores', 15), f('texture', 18), f('dehydration', 20)], goals: [] });
  console.log(`  推薦數量：${out.length}`);
  check('輕微問題唔觸發推薦', out.length === 0, `竟然推薦咗 ${out.length} 項`);
}

console.log('\n── 個案 G：停工期同預算限制會標示 ──');
{
  const out = matchTreatments({
    findings: [f('texture', 80), f('pores', 70), f('submental_fat', 65)],
    goals: ['texture_pores'],
    maxDowntimeDays: 0,
    budgetHKD: 3000,
  });
  const longDowntime = out.find((r) => r.treatment.downtimeDays[1] > 1);
  check('停工期長嘅療程有警示', Boolean(longDowntime?.flags.some((x) => x.includes('停工期'))));
  // 未錄入價錢就唔應該報「超出預算」—— 攞 $0 去比較毫無意義
  const unpricedBudgetFlag = out.some((r) => !r.priceConfirmed && r.flags.some((x) => x.includes('預算')));
  check('未核實價錢唔會觸發預算警示', !unpricedBudgetFlag);
}

console.log('\n── 價格版面開關 ──');
{
  const anyConfirmed = ALL_TREATMENTS.some(isPriceConfirmed);
  check('PRICING_ENABLED 同目錄狀態一致', PRICING_ENABLED === anyConfirmed,
    `PRICING_ENABLED=${PRICING_ENABLED} 但 ${anyConfirmed ? '有' : '冇'}已核實價錢`);

  const out = matchTreatments({
    findings: [f('texture', 80), f('pores', 70)],
    goals: [],
    budgetHKD: 1,  // 極低預算：如果價格版面開咗，應該人人超支
  });
  if (!PRICING_ENABLED) {
    check('價格版面關閉時唔會出預算警示', !out.some((r) => r.flags.some((x) => x.includes('預算'))));
    check('價格版面關閉時全部估算為 0', out.every((r) => r.estCostHKD.max === 0));
    const plan = buildPhasedPlan(out);
    check('價格版面關閉時分階段小計為 0', plan.every((p) => p.subtotalHKD.max === 0));
  } else {
    check('價格版面開啟時有療程計到價', out.some((r) => r.estCostHKD.max > 0));
  }
}

console.log('\n── 客人可見文字唔應該有開發備註 ──');
{
  // 「請確認」可以係俾客人嘅正當建議，唔計；「請補充」一定係寫俾開發者睇
  const DEV_MARKER = /待補充|待確認|TODO|⚠️|請補充|XXX/;
  const leaked = ALL_TREATMENTS.filter((t) =>
    [t.name, t.brand, t.mechanism, t.sessions, t.interval, t.onset, t.duration, t.regulation, t.notes ?? ''].some(
      (v) => DEV_MARKER.test(v),
    ),
  );
  check('冇開發備註漏落客人可見欄位', leaked.length === 0, leaked.map((t) => t.id).join(', '));
  check('internalNote 唔會被當成 notes 顯示', ALL_TREATMENTS.every((t) => t.notes !== t.internalNote || !t.internalNote));
}

console.log('\n── 測試模式示範數據 ──');
{
  check('有示範個案', DEMO_CASES.length >= 3);

  const badKey = DEMO_CASES.flatMap((c) => c.analysis.findings).find((f) => !(f.key in FINDING_LABELS));
  check('所有 finding key 都合法', !badKey, badKey?.key);

  const badRange = DEMO_CASES.flatMap((c) => c.analysis.findings).find(
    (f) => f.severity < 0 || f.severity > 100 || f.confidence < 0 || f.confidence > 1,
  );
  check('severity / confidence 喺合法範圍', !badRange, badRange?.key);

  check('有紅旗示範個案（測得到轉介警示）', DEMO_CASES.some((c) => c.analysis.redFlags.length > 0));
  check('有化妝示範個案（測得到相片質素警告）', DEMO_CASES.some((c) => c.analysis.imageQuality.makeupDetected));

  // 每個「正常」個案都要行得出推薦，否則測試版會出空白畫面
  for (const c of DEMO_CASES.filter((x) => x.id !== 'redflag')) {
    const out = matchTreatments({ findings: c.analysis.findings as Finding[], goals: c.matches });
    const presentable = out.filter((r) => r.score >= MIN_PRESENTABLE_SCORE);
    check(`「${c.label}」出到推薦`, presentable.length >= 1, `只有 ${presentable.length} 項`);
  }

  // 低信心個案應該收斂，唔應該扮到好肯定
  const rf = DEMO_CASES.find((c) => c.id === 'redflag')!;
  const rfOut = matchTreatments({ findings: rf.analysis.findings as Finding[], goals: ['brighten'] });
  const rfShown = rfOut.filter((r) => r.score >= MIN_PRESENTABLE_SCORE);
  check('低信心個案推薦收斂（≤3 項）', rfShown.length <= 3, `出咗 ${rfShown.length} 項`);

  // 目標配對：揀「緊緻提升」應該行到老化個案而唔係暗瘡個案
  check('揀緊緻提升 → 老化個案', pickDemoCase(['lift']).id === 'aging');
  // 平手時專一度高嘅個案要贏，否則新加嘅專門個案永遠揀唔到
  check('揀撫平皺紋 → 動態紋個案（唔係老化個案）', pickDemoCase(['smooth_lines']).id === 'lines');
  check('揀眼周改善 → 動態紋個案', pickDemoCase(['eye_area']).id === 'lines');
  check('揀瘦面 → 老化個案（lines 冇覆蓋）', pickDemoCase(['slim_face']).id === 'aging');
  check('揀暗瘡 → 暗瘡個案', pickDemoCase(['clear_acne']).id === 'acne');
  check('揀美白 → 色斑個案', pickDemoCase(['brighten']).id === 'pigment');
  check('可以指定個案', pickDemoCase(['lift'], 'redflag').id === 'redflag');
  check('指定唔存在嘅個案會 fallback', pickDemoCase(['lift'], 'nope').id === 'aging');
}

console.log('\n── MVP 預約連結 ──');
{
  const url = buildBookingUrl({ phone: '852 1234 5678', goals: ['lift', 'brighten'], treatments: ['Ultherapy 超聲刀', '皮秒激光'] });
  check('號碼會清走空格同符號', url?.startsWith('https://wa.me/85212345678?text=') ?? false, url ?? 'null');

  const decoded = decodeURIComponent(url!.split('text=')[1]);
  check('訊息含改善目標', decoded.includes('緊緻提升') && decoded.includes('美白去斑'));
  check('訊息含建議療程', decoded.includes('Ultherapy 超聲刀'));
  check('中文有正確 encode（唔會變空白）', url!.includes('%E4%BD%A0%E5%A5%BD'));
  check('換行有 encode', url!.includes('%0A'));

  check('冇號碼時回傳 null（避免死連結）', buildBookingUrl({ phone: undefined, goals: [], treatments: [] }) === null);
  check('空字串號碼都要當冇設定', buildBookingUrl({ phone: '', goals: [], treatments: [] }) === null);
  check('純符號號碼都要當冇設定', buildBookingUrl({ phone: '---', goals: [], treatments: [] }) === null);

  const bare = buildBookingUrl({ phone: '85212345678', goals: [], treatments: [] });
  check('冇目標冇療程都要出到連結', bare !== null);
}

console.log('\n── AI 輸出後處理（prompt 求，code 保證）──');
{
  const base = (over: Partial<Analysis> = {}): Analysis => ({
    imageQuality: { usable: true, lighting: 'good', issues: [], makeupDetected: false },
    structure: {
      faceShape: 'oval',
      faceShapeNote: '',
      symmetryScore: 90,
      agingPattern: 'minimal',
      estimatedSkinType: 'III',
    },
    findings: [],
    overallSummary: '（測試）',
    redFlags: [],
    ...over,
  });
  const fnd = (key: FindingKey, severity: number, confidence: number): Analysis['findings'][number] => ({
    key,
    severity,
    confidence,
    observation: '(測試)',
    location: '整體',
  });

  // ── 化妝一定要壓低膚質信心 ──
  // prompt 已經叫個模型咁做，但佢唔跟嘅時候冇人知：schema 照樣通過。
  const makeup = postProcess(
    base({
      imageQuality: { usable: true, lighting: 'good', issues: [], makeupDetected: true },
      findings: [fnd('pigmentation', 70, 0.9), fnd('jowls', 60, 0.9)],
    }),
  );
  const pig = makeup.analysis.findings.find((f) => f.key === 'pigmentation')!;
  const jowls = makeup.analysis.findings.find((f) => f.key === 'jowls')!;
  check('化妝 → 色斑信心被壓低', pig.confidence <= 0.45, String(pig.confidence));
  check('化妝 → 嚴重程度唔變（severity 同 confidence 係兩件事）', pig.severity === 70);
  check('化妝 → 結構性特徵唔受影響（粉底遮唔到嘴邊肉）', jowls.confidence === 0.9, String(jowls.confidence));
  check('修正會有紀錄，唔係靜靜雞改', makeup.adjustments.some((x) => x.rule === 'makeup-cap'));

  // ── 光線差 ──
  const dark = postProcess(
    base({
      imageQuality: { usable: true, lighting: 'poor', issues: [], makeupDetected: false },
      findings: [fnd('redness', 50, 0.9)],
    }),
  );
  check('光線差 → 膚質信心被壓低', dark.analysis.findings[0].confidence <= 0.5);

  // ── 重複 key ──
  // schema 攔唔到。唔理嘅話配對引擎會將同一個問題計兩次，分數不合理咁高。
  const dup = postProcess(base({ findings: [fnd('pores', 40, 0.5), fnd('pores', 80, 0.9)] }));
  check('同一個 key 只保留一項', dup.analysis.findings.length === 1);
  check('重複時保留權重較高嗰項', dup.analysis.findings[0].severity === 80);

  // ── 雜訊過濾 ──
  const noisy = postProcess(base({ findings: [fnd('pores', 40, 0.05), fnd('texture', 0, 0.9), fnd('acne_active', 50, 0.8)] }));
  check('丟走信心過低嘅觀察', !noisy.analysis.findings.some((f) => f.key === 'pores'));
  check('丟走 severity 為 0 嘅觀察', !noisy.analysis.findings.some((f) => f.key === 'texture'));
  check('保留正常觀察', noisy.analysis.findings.some((f) => f.key === 'acne_active'));

  // ── 排序 ──
  const ord = postProcess(base({ findings: [fnd('pores', 90, 0.3), fnd('melasma', 60, 0.9)] }));
  check(
    '按 嚴重程度×信心 排序（低信心嘅高分項唔應該排頭）',
    ord.analysis.findings[0].key === 'melasma',
    ord.analysis.findings[0].key,
  );

  // ── redFlags 絕對唔可以被過濾 ──
  const rf = postProcess(base({ findings: [fnd('pores', 10, 0.01)], redFlags: ['左顴骨有粒邊界模糊嘅痣，建議由醫生檢查'] }));
  check('redFlags 永遠保留（漏報代價最高）', rf.analysis.redFlags.length === 1);

  // ── 可用性判斷 ──
  check('模型話唔可用 → 唔可以扮有結果', usabilityVerdict(base({ imageQuality: { usable: false, lighting: 'poor', issues: [], makeupDetected: false } })).ok === false);
  const noFace = usabilityVerdict(base({ findings: [], redFlags: [] }));
  check('乜都觀察唔到 → 當唔可用（大機會唔係一張人臉）', noFace.ok === false);
  check('唔可用時要有重影建議，唔可以淨係話唔得', noFace.retakeHints.length > 0);
  check('正常相片 → 可用', usabilityVerdict(base({ findings: [fnd('pores', 40, 0.8)] })).ok === true);
  const mk = usabilityVerdict(base({ imageQuality: { usable: false, lighting: 'good', issues: [], makeupDetected: true } }));
  check('化妝會出現喺重影建議入面', mk.retakeHints.some((h) => h.includes('素顏')));
}

console.log('\n── QR 對外網址（掃到但去唔到 = 最貴嘅錯）──');
{
  const orig = process.env.NEXT_PUBLIC_SITE_URL;
  const set = (v?: string) => {
    if (v === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = v;
  };
  const H = (h: Record<string, string>) => new Headers(h);

  check('localhost 判定為本機', classifyHost('localhost') === 'local');
  check('127.0.0.1 判定為本機', classifyHost('127.0.0.1') === 'local');
  check('::1 判定為本機', classifyHost('::1') === 'local');
  check('192.168.x 判定為區域網', classifyHost('192.168.1.42') === 'lan');
  check('10.x 判定為區域網', classifyHost('10.0.0.5') === 'lan');
  check('172.16–31 判定為區域網', classifyHost('172.20.1.1') === 'lan');
  // 172.32 唔屬私有網段，唔可以誤判 —— 誤判會令一個正常網址印唔到海報
  check('172.32 唔係私有網段', classifyHost('172.32.1.1') === 'public');
  check('正常網域係公開', classifyHost('drtimeless.com') === 'public');

  set(undefined);
  const local = resolvePublicUrl(H({ host: 'localhost:3000' }), 'localhost:3000');
  check('本機開 → 唔可以印', local.printable === false);
  check('本機開 → 有解釋點解', Boolean(local.warning?.includes('localhost')));

  const lan = resolvePublicUrl(H({ host: '192.168.1.42:3000' }), 'x');
  check('區域網 → 唔可以印（出咗診所 Wi-Fi 就死）', lan.printable === false);

  const prod = resolvePublicUrl(H({ 'x-forwarded-host': 'app.vercel.app', 'x-forwarded-proto': 'https' }), 'x');
  check('正式網域 → 印得', prod.printable === true);
  check('正式網域 → 用返 https', prod.url === 'https://app.vercel.app', prod.url);
  // proxy 後面一定要睇 x-forwarded-host，否則會攞到內部位址
  const proxied = resolvePublicUrl(H({ host: '10.0.0.7:3000', 'x-forwarded-host': 'real.com', 'x-forwarded-proto': 'https' }), 'x');
  check('proxy 後面用 x-forwarded-host', proxied.url === 'https://real.com', proxied.url);

  set('https://www.drtimeless.com');
  const env = resolvePublicUrl(H({ host: 'localhost:3000' }), 'x');
  check('設咗 SITE_URL 就唔理 Host（preview 網址唔會污染海報）', env.url === 'https://www.drtimeless.com', env.url);
  check('設咗 SITE_URL → 印得', env.printable === true);

  set('https://www.drtimeless.com/');
  check('尾隨斜線唔會變成 //', resolvePublicUrl(H({}), 'x').url === 'https://www.drtimeless.com');

  // 設錯格式唔可以靜靜雞當冇設 —— 否則會 fallback 去 localhost 然後印咗
  set('www.drtimeless.com');
  const bad = resolvePublicUrl(H({ host: 'localhost:3000' }), 'x');
  check('SITE_URL 漏咗 https:// → 唔可以印', bad.printable === false);
  check('SITE_URL 格式錯 → 講明錯咩', Boolean(bad.warning?.includes('https://')));

  set('http://localhost:3000');
  check('SITE_URL 設咗做 localhost → 一樣唔可以印', resolvePublicUrl(H({}), 'x').printable === false);

  set(orig);
}

console.log('\n── 區域網位址（喺本機用手機試）──');
{
  const addrs = lanAddresses();
  console.log(`  搵到 ${addrs.length} 個：${addrs.join(', ') || '（冇 —— 可能喺容器入面行）'}`);

  check('唔會回 localhost / 127.x（掃咗等於冇）', !addrs.some((a) => /^127\./.test(a)));
  check('全部係 IPv4 格式', addrs.every((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a)));
  // 只可以收真正嘅私有網段。雲端內部位址、TEST-NET(192.0.2.x)、CGNAT
  // 全部都唔係「同一個 Wi-Fi 掃得到」—— 收咗就係再整多一個死 QR。
  check(
    '只收 10 / 172.16-31 / 192.168 三個私有網段',
    addrs.every((a) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a)),
    addrs.join(', '),
  );

  const u = lanUrl('3000');
  if (addrs.length) {
    check('砌到區域網網址', u === `http://${addrs[0]}:3000`, String(u));
    // 呢個斷言講嘅係「靠 Host 判斷」嗰條路 —— 但設咗 NEXT_PUBLIC_SITE_URL
    // 嘅環境（例如 CI）resolvePublicUrl 會刻意唔理 Host（另有測試專門驗），
    // 所以要暫時清走佢先測到本意
    const savedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    check(
      '區域網位址唔會被當成可印海報',
      resolvePublicUrl(new Headers({ host: `${addrs[0]}:3000` }), 'x').printable === false,
    );
    if (savedSiteUrl !== undefined) process.env.NEXT_PUBLIC_SITE_URL = savedSiteUrl;
    check('冇 port 時唔會多咗個冒號', lanUrl('') === `http://${addrs[0]}`, String(lanUrl('')));
  } else {
    // 攞唔到就要老實回 null，唔可以亂猜個 IP 出嚟俾人掃
    check('攞唔到位址時回 null（唔會亂猜）', u === null);
  }
}

console.log('\n── 職員頁面保護 ──');
{
  const env = { s: process.env.STAFF_TOKEN, d: process.env.DEMO_MODE };
  const set = (staff?: string, demo?: string) => {
    if (staff === undefined) delete process.env.STAFF_TOKEN;
    else process.env.STAFF_TOKEN = staff;
    if (demo === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = demo;
  };

  check('/pro 要保護', isStaffPath('/pro'));
  check('/share 要保護', isStaffPath('/share'));
  check('/embed/setup 要保護', isStaffPath('/embed/setup'));
  check('/records 要保護（客人電話＋評分喺入面）', isStaffPath('/records'));
  check('/api/records 要保護', isStaffPath('/api/records'));
  // 前綴比對唔可以誤中相似路徑
  check('/record（冇 s）唔會誤中', !isStaffPath('/record'));
  check('客人版 / 唔可以被鎖', !isStaffPath('/'));
  check('嵌入版 /embed 唔可以被鎖', !isStaffPath('/embed'));
  // /embed 同 /embed/setup 只差幾個字，前綴比對寫錯就會鎖死客人入口
  check('/embed 唔會俾 /embed/setup 嘅規則誤中', !isStaffPath('/embed'));

  // 未設密碼 + 正式環境 → 一定要拒絕。唔可以出現「以為有保護但其實冇」。
  set(undefined, undefined);
  const unset = checkStaff(null, undefined);
  check('未設密碼＋正式環境 → 拒絕', unset.action === 'deny', JSON.stringify(unset));
  check('拒絕原因講到係未設定', unset.action === 'deny' && unset.reason === 'no-token-configured');

  // 未設密碼 + 測試模式 → 放行，方便試
  set(undefined, '1');
  check('未設密碼＋測試模式 → 放行', checkStaff(null, undefined).action === 'allow');

  set('s3cret', undefined);
  check('冇密碼 → 拒絕', checkStaff(null, undefined).action === 'deny');
  check('錯密碼 → 拒絕', checkStaff('wrong', undefined).action === 'deny');
  const ok = checkStaff('s3cret', undefined);
  check('啱密碼 → 種 cookie', ok.action === 'set-cookie');
  check('有啱 cookie → 直接放行', checkStaff(null, 's3cret').action === 'allow');
  check('錯 cookie → 拒絕', checkStaff(null, 'stale').action === 'deny');
  // 空字串唔可以當「設咗密碼」，否則 STAFF_TOKEN= 會變成人人入得
  set('   ', undefined);
  check('空白密碼當未設定（唔可以人人入得）', checkStaff('   ', undefined).action === 'deny');

  set(env.s, env.d);
}

console.log('\n── 官網嵌入允許清單（成本安全）──');
{
  const set = (v?: string) => {
    if (v === undefined) delete process.env.EMBED_ALLOWED_ORIGINS;
    else process.env.EMBED_ALLOWED_ORIGINS = v;
  };
  const original = process.env.EMBED_ALLOWED_ORIGINS;

  // 未設定 → 一定要 fail closed。容許全世界嵌入即係任何人都可以攞你嘅
  // API 額度做佢哋生意，而你唯一嘅線索係月尾張帳單。
  set(undefined);
  check('未設定時只准同源（fail closed）', frameAncestors() === "'self'", frameAncestors());
  check('未設定時清單係空', allowedOrigins().length === 0);

  // 真正執行者係瀏覽器 CSP —— 呢度驗嘅係我哋餵俾 frame-ancestors 嘅字串
  set('https://www.drtimeless.com,https://drtimeless.com');
  check('設咗之後 CSP 列齊', frameAncestors() === "'self' https://www.drtimeless.com https://drtimeless.com", frameAncestors());
  // www 同冇 www 係兩個 origin，要分別列 —— 呢個係最常見嘅設定錯誤；
  // 清單唔會自動補另一個版本
  check('冇 www 版本要獨立列', allowedOrigins().includes('https://drtimeless.com') && allowedOrigins().length === 2);
  // http 同 https 亦係兩個 origin，唔可以自動當同一個
  set('https://www.drtimeless.com');
  check('http 版本唔會自動出現', !frameAncestors().includes('http://www.drtimeless.com'));

  set(' https://a.com , https://b.com ,, ');
  check('清單容忍空格同多餘逗號', allowedOrigins().length === 2, JSON.stringify(allowedOrigins()));
  set('https://a.com/');
  check('尾隨斜線會被剝走', allowedOrigins()[0] === 'https://a.com', JSON.stringify(allowedOrigins()));

  set(original);
}

console.log('\n── 相片質素預檢（上傳前，慳 API 錢）──');
{
  /** 砌一張 RGBA 測試圖。fn 回 0–255 灰階值。 */
  const make = (w: number, h: number, fn: (x: number, y: number) => number) => {
    const d = new Array(w * h * 4).fill(255);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        const v = fn(x, y);
        d[p] = d[p + 1] = d[p + 2] = v;
      }
    }
    return d;
  };
  const N = 64;

  const flatMid = analysePixels(make(N, N, () => 128), N, N);
  check('平坦灰圖：亮度準確', Math.abs(flatMid.brightness - 128) < 1, String(flatMid.brightness));
  check('平坦圖冇邊緣 → 判定為矇', flatMid.sharpness < THRESHOLDS.BLURRY, String(flatMid.sharpness));

  const dark = analysePixels(make(N, N, () => 20), N, N);
  check('全黑圖 → 低過過暗門檻', dark.brightness < THRESHOLDS.DARK, String(dark.brightness));

  const blown = analysePixels(make(N, N, () => 250), N, N);
  check('過曝圖 → 高過過亮門檻', blown.brightness > THRESHOLDS.BRIGHT, String(blown.brightness));

  // 棋盤格 = 最高頻細節，代表對焦準嘅相
  const sharp = analysePixels(make(N, N, (x, y) => ((x + y) % 2 ? 220 : 40)), N, N);
  check('高細節圖 → 判定為清晰', sharp.sharpness > THRESHOLDS.BLURRY, String(sharp.sharpness));
  check('清晰圖嘅方差遠高於矇圖', sharp.sharpness > flatMid.sharpness * 10);

  // 緩慢漸變 = 失焦嘅相，唔應該當成清晰
  const gradient = analysePixels(make(N, N, (x) => 40 + (x / N) * 180), N, N);
  check('緩慢漸變（失焦）→ 判定為矇', gradient.sharpness < THRESHOLDS.BLURRY, String(gradient.sharpness));

  // 亮度用 Rec.709 加權，唔係三通道求其平均 —— 純綠應該遠光過純藍
  const chan = (r: number, g: number, b: number) => {
    const d = new Array(N * N * 4).fill(255);
    for (let i = 0; i < N * N; i++) {
      d[i * 4] = r;
      d[i * 4 + 1] = g;
      d[i * 4 + 2] = b;
    }
    return analysePixels(d, N, N).brightness;
  };
  check('亮度用 Rec.709 加權（綠 > 紅 > 藍）', chan(0, 255, 0) > chan(255, 0, 0) && chan(255, 0, 0) > chan(0, 0, 255));
}

console.log('\n── 速率限制 ──');
{
  const req = (ip?: string, real?: string) =>
    new Request('http://localhost/api/consult', {
      headers: {
        ...(ip ? { 'x-forwarded-for': ip } : {}),
        ...(real ? { 'x-real-ip': real } : {}),
      },
    });

  const CFG = { perIp: 3, windowSec: 3600, dailyTotal: 5 };

  // ── 每個 IP 嘅窗口 ──
  setRateLimitStore(createMemoryStore());
  const a = req('1.1.1.1');
  let allowed = 0;
  for (let i = 0; i < 5; i++) {
    if (checkRateLimit(a, CFG).ok) {
      allowed++;
      recordUsage(a);
    }
  }
  check('同一 IP 只放行 perIp 次', allowed === CFG.perIp, `放行咗 ${allowed} 次`);

  const blocked = checkRateLimit(a, CFG);
  check('超額之後會擋', !blocked.ok);
  check('擋嗰陣有 Retry-After 秒數', (blocked.retryAfterSec ?? 0) > 0, String(blocked.retryAfterSec));
  check('擋嗰陣有俾人睇嘅原因', Boolean(blocked.reason?.length));

  // 唔同 IP 唔應該互相拖累 —— 一個人濫用唔可以封晒所有客人
  check('第二個 IP 唔受影響', checkRateLimit(req('2.2.2.2'), CFG).ok);

  // ── 驗證失敗唔應該食額度 ──
  setRateLimitStore(createMemoryStore());
  const b = req('3.3.3.3');
  for (let i = 0; i < 10; i++) checkRateLimit(b, CFG); // 淨係 check，冇 recordUsage
  check('淨係 check 唔會食額度（相片驗證失敗唔應該罰客人）', checkRateLimit(b, CFG).ok);

  // ── 窗口過期 ──
  setRateLimitStore(createMemoryStore());
  const c = req('4.4.4.4');
  // dailyTotal 要放鬆 —— 每日上限係先查嘅，唔隔離就會測緊錯嘅嘢
  const ZERO = { ...CFG, windowSec: 0, dailyTotal: 1000 };
  for (let i = 0; i < 10; i++) recordUsage(c);
  check('窗口過咗就恢復', checkRateLimit(c, ZERO).ok);

  // ── 全站每日總量：分散式濫用嘅硬上限 ──
  setRateLimitStore(createMemoryStore());
  for (let i = 0; i < CFG.dailyTotal; i++) recordUsage(req(`10.0.0.${i}`)); // 每個 IP 只用一次
  const fresh = req('10.0.0.99');
  const capped = checkRateLimit(fresh, CFG);
  check('每日總量爆咗，全新 IP 都要擋', !capped.ok);
  check('每日上限嘅 Retry-After 會等到明日', (capped.retryAfterSec ?? 0) > 0);
  check(
    '每日上限訊息會引導客人預約（唔好淨係話 error）',
    capped.reason?.includes('WhatsApp') === true,
    capped.reason,
  );

  const snap = usageSnapshot(CFG);
  check('usageSnapshot 睇到今日用量', snap.today === CFG.dailyTotal && snap.dailyLimit === CFG.dailyTotal,
    JSON.stringify(snap));

  // ── clientIp 解析 ──
  check('x-forwarded-for 取最左邊嗰個', clientIp(req('9.9.9.9, 10.0.0.1, 172.16.0.1')) === '9.9.9.9');
  check('冇 xff 就用 x-real-ip', clientIp(req(undefined, '8.8.8.8')) === '8.8.8.8');
  check('乜都冇就 fallback 共用額度（好過完全冇限制）', clientIp(req()) === 'unknown');

  setRateLimitStore(createMemoryStore()); // 唔好污染後面
}

console.log('\n── 漏斗統計 ──');
{
  setFunnelStore(createMemoryFunnel());

  check(
    '每個步驟都有中文標籤',
    FUNNEL_STEPS.every((s) => Boolean(STEP_LABELS[s])),
    FUNNEL_STEPS.filter((s) => !STEP_LABELS[s]).join(','),
  );

  track('page_view', '2026-01-01');
  track('page_view', '2026-01-01');
  track('photo_added', '2026-01-01');
  const snap = funnelSnapshot();
  check('計數正確', snap['2026-01-01']?.page_view === 2 && snap['2026-01-01']?.photo_added === 1,
    JSON.stringify(snap));

  const rates = conversionRates({ page_view: 100, photo_added: 50, goals_selected: 40, booking_clicked: 4 });
  const photo = rates.find((r) => r.step === 'photo_added')!;
  check('通過率相對上一步', Math.abs((photo.fromPrev ?? 0) - 0.5) < 1e-9, String(photo.fromPrev));
  const booking = rates.find((r) => r.step === 'booking_clicked')!;
  check('通過率相對頂部', Math.abs((booking.fromTop ?? 0) - 0.04) < 1e-9, String(booking.fromTop));

  // 零流量嗰陣唔可以出 NaN / Infinity，否則個 dashboard 一開就係垃圾
  const empty = conversionRates({});
  check('零流量唔會出 NaN', empty.every((r) => r.fromPrev === null || Number.isFinite(r.fromPrev)));
  check('零流量嘅 fromTop 係 null 而唔係 0/0', empty.every((r) => r.fromTop === null));

  // 保留期：長期跑落去唔可以無限食記憶體
  setFunnelStore(createMemoryFunnel());
  for (let i = 1; i <= 40; i++) track('page_view', `2026-02-${String(i).padStart(2, '0')}`);
  const kept = Object.keys(funnelSnapshot());
  check('只保留最近 30 日', kept.length === 30, `保留咗 ${kept.length} 日`);
  check('刮走最舊嗰啲', !kept.includes('2026-02-01') && !kept.includes('2026-02-10'));
  check('留低最新嗰日（最新嘅數據唔可以被刮走）', kept.includes('2026-02-40'));
  check('snapshot 由新到舊排', kept[0] === '2026-02-40', kept[0]);

  setFunnelStore(createMemoryFunnel());
}

{
  // camera_fallback：側事件，要收（唔收就唔知全站相機死咗），但唔入
  // 線性轉化鏈（佢唔係「下一步」，係徵狀）
  check('camera_fallback 已註冊', FUNNEL_STEPS.includes('camera_fallback'));
  check('camera_fallback 唔喺線性轉化鏈', conversionRates({}).every((r) => r.step !== 'camera_fallback'));
}

console.log('\n── 前端埋點 ──');
{
  // trackStep 靠 window 判斷係咪喺瀏覽器；喺 node 度模擬一個
  const g = globalThis as unknown as { window?: unknown; fetch: typeof fetch };
  const realFetch = g.fetch;
  let calls: string[] = [];
  g.window = {};
  g.fetch = (async (_url: string, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)).step);
    return new Response('{}');
  }) as unknown as typeof fetch;

  resetTracking();
  calls = [];
  trackStep('goals_selected');
  trackStep('goals_selected');
  trackStep('goals_selected');
  check('同一步驟每個 session 只計一次', calls.length === 1, `送咗 ${calls.length} 次`);

  trackStep('photo_added');
  check('唔同步驟各自計一次', calls.length === 2 && calls[1] === 'photo_added', calls.join(','));

  resetTracking();
  calls = [];
  trackStep('goals_selected');
  check('resetTracking 之後可以再計（再分析一次）', calls.length === 1);

  calls = [];
  trackStep('camera_fallback');
  trackStep('camera_fallback');
  check('camera_fallback 每 session 計一次', calls.length === 1 && calls[0] === 'camera_fallback', calls.join(','));

  calls = [];
  trackStep('analyze_failed', { once: false });
  trackStep('analyze_failed', { once: false });
  check('once:false 可以重複計', calls.length === 2, String(calls.length));

  // 統計壞咗唔應該炸死個工具
  g.fetch = (() => Promise.reject(new Error('network down'))) as unknown as typeof fetch;
  resetTracking();
  let threw = false;
  try {
    trackStep('page_view');
  } catch {
    threw = true;
  }
  check('埋點失敗唔會拋錯（唔可以阻到客人用）', !threw);

  g.fetch = realFetch;
  delete g.window;
}

console.log('\n── 面圖區域映射 ──');
{
  // 面圖係多對多映射（一項問題可以屬幾個區），但 33 個 FindingKey
  // 必須每個至少一個區 —— 唔係嘅話客人喺面圖就揀唔到嗰項嘢。
  const cov = regionCoverageCheck();
  check('全部 33 項特徵都揀得到', cov.missing.length === 0, cov.missing.join(', '));
  check('冇空區域', cov.emptyRegions.length === 0, cov.emptyRegions.join(', '));
  check('冇未知 FindingKey', cov.unknownKeys.length === 0, cov.unknownKeys.join(', '));
  check('固定 12 區（面圖形狀對應）', FACE_REGIONS.length === 12, String(FACE_REGIONS.length));

  const banned = /保證|永久|根治|最有效|100%|無風險|絕對|醫護/;
  check('區域標籤冇禁用字眼', FACE_REGIONS.every((r) => !banned.test(r.label)));

  // 反推目標：面圖揀嘅嘢要轉譯成 goal 先入到引擎
  const g1 = goalsFromFindings(['nasolabial_fold']);
  check('法令紋 → 撫平皺紋目標', g1.includes('smooth_lines'), g1.join(','));
  const g2 = goalsFromFindings(['bunny_lines']);
  check('GOALS 冇覆蓋嘅 key 有 fallback（鼻背紋）', g2.length > 0, g2.join(','));
  const allKeys = Object.keys(FINDING_LABELS) as FindingKey[];
  check('任何單一自選都反推到至少一個目標', allKeys.every((f) => goalsFromFindings([f]).length > 0));

  const note = buildConcernNotes(['nasolabial_fold', 'dark_circles']);
  check('notes 有帶防迎合句', !!note && note.includes('照直講'), note);
  check('notes 冇禁用字眼', !!note && !banned.test(note));
  check('冇自選 → 唔生成 notes', buildConcernNotes([]) === undefined);
}

console.log('\n── 8 大範疇評分 ──');
{
  // 完整分割：33 個特徵，每個恰好屬一個範疇。加新 FindingKey 而唔分類，
  // 個特徵就會喺雷達圖靜靜雞消失 —— 呢個測試就係為咗唔俾佢靜靜雞。
  const part = partitionCheck();
  check('全部特徵都有範疇', part.missing.length === 0, part.missing.join(', '));
  check('冇特徵被分入兩個範疇', part.duplicated.length === 0, part.duplicated.join(', '));
  check('固定 8 個範疇（雷達圖軸唔可以浮動）', CATEGORIES.length === 8, String(CATEGORIES.length));

  const empty = computeCategoryScores([]);
  check('冇觀察 → 照回 8 項', empty.length === 8, String(empty.length));
  check('冇觀察 → 全部 100 分', empty.every((c) => c.score === 100));
  check('冇觀察 → 「冇明顯問題」而唔係「良好」', empty.every((c) => c.bandLabel === '冇明顯問題'));

  const single = computeCategoryScores([{ key: 'pigmentation', severity: 40, confidence: 1 }]);
  const pig = single.find((c) => c.key === 'pigment')!;
  check('單一觀察 sev40 conf1 → 60 分', pig.score === 60, String(pig.score));
  check('其他範疇唔受影響（照 100）', single.filter((c) => c.key !== 'pigment').every((c) => c.score === 100));

  // 信心加權：低信心觀察拉分嘅力要細啲
  const weighted = computeCategoryScores([
    { key: 'forehead_lines', severity: 80, confidence: 0.5 },
    { key: 'crows_feet', severity: 20, confidence: 1 },
  ]);
  const wr = weighted.find((c) => c.key === 'wrinkles')!;
  // (80×0.5 + 20×1) / 1.5 = 40 → 100 − 40 = 60
  check('信心加權平均（唔係求其平均）', wr.score === 60, String(wr.score));

  check('85 分係「良好」下限', bandOf(85, 1).bandLabel === '良好');
  check('84 分落「可改善」', bandOf(84, 1).bandLabel === '可改善');
  check('60 分仲係「可改善」', bandOf(60, 1).bandLabel === '可改善');
  check('59 分落「建議關注」', bandOf(59, 1).bandLabel === '建議關注');

  const extreme = computeCategoryScores([{ key: 'redness', severity: 100, confidence: 1 }]);
  check('分數唔會負', extreme.every((c) => c.score >= 0));

  const lowC = computeCategoryScores([{ key: 'acne_active', severity: 50, confidence: 0.4 }]);
  check('平均信心 <0.5 → 標 lowConfidence', lowC.find((c) => c.key === 'acne_oil')!.lowConfidence);
  const okC = computeCategoryScores([{ key: 'acne_active', severity: 50, confidence: 0.6 }]);
  check('信心 0.6 → 唔標', !okC.find((c) => c.key === 'acne_oil')!.lowConfidence);

  // API 嗰邊 key 係 string —— 未知 key 唔可以炸，亦唔可以亂入賬
  const unknown = computeCategoryScores([{ key: 'not_a_real_key', severity: 90, confidence: 1 }]);
  check('未知 key 靜靜跳過', unknown.every((c) => c.score === 100));

  // 合規：範疇名同分數帶字眼會直接見客
  const banned = /保證|永久|根治|最有效|100%|無風險|絕對|醫護/;
  const labels = [...CATEGORIES.map((c) => c.label), '冇明顯問題', '良好', '可改善', '建議關注'];
  check('範疇／分數帶字眼冇違禁詞', labels.every((l) => !banned.test(l)),
    labels.filter((l) => banned.test(l)).join(', '));
}

console.log('\n── 電話標準化（儲存紀錄用）──');
{
  check('+852 空格 → 8 位', normalizePhone('+852 9123 4567') === '91234567');
  check('852 前綴 → 剝走', normalizePhone('85291234567') === '91234567');
  check('連字號 → 剝走', normalizePhone('9123-4567') === '91234567');
  check('00852 固網 → 8 位', normalizePhone('00852 2123 4567') === '21234567');
  check('太短 → 唔收', normalizePhone('12345') === null);
  check('9 位 → 唔收', normalizePhone('123456789') === null);
  check('1 字頭 → 唔收（香港冇）', normalizePhone('11234567') === null);
  check('空字串 → 唔收', normalizePhone('') === null);
}

console.log('\n── schema.sql 同 code 同步 ──');
{
  // D1 個表係手寫 SQL，冇 ORM 幫手對欄名 —— 改咗 code 唔改 schema
  // 就要等到部署先炸。至少確保啲名冇甩開。
  const sql = readFileSync('schema.sql', 'utf-8');
  for (const token of ['visits', 'phone', 'created_at', 'category_scores', 'findings', 'idx_visits_phone']) {
    check(`schema 有 ${token}`, sql.includes(token));
  }
  check("source 有 CHECK 約束", /CHECK\s*\(\s*source\s+IN/i.test(sql));
}

console.log('\n── 客人紀錄（記憶體 store）──');
(async () => {
  const store = createMemoryVisitStore();
  check('記憶體 store 承認自己唔持久', store.persistent === false);

  const rec = (phone: string, createdAt: string): VisitRecord => ({
    id: `${phone}-${createdAt}`,
    phone,
    createdAt,
    source: 'customer',
    goals: [],
    categoryScores: [],
    findings: [],
  });

  await store.save(rec('91234567', '2026-08-01T10:00:00.000Z'));
  await store.save(rec('91234567', '2026-08-20T10:00:00.000Z'));
  await store.save(rec('21234567', '2026-08-10T10:00:00.000Z'));

  const a = await store.listByPhone('91234567');
  check('搵到自己兩次', a.length === 2, String(a.length));
  check('新到舊排序（後台睇最新一次先）', a[0]?.createdAt === '2026-08-20T10:00:00.000Z');
  check('唔會撈埋第二個人嘅紀錄', (await store.listByPhone('21234567')).length === 1);
  check('冇紀錄嘅電話 → 空list，唔係錯誤', (await store.listByPhone('98765432')).length === 0);

  // 保留期：25 個月前嘅紀錄唔應該再出現（PDPO 講咗 24 個月就係 24 個月）
  const old = new Date();
  old.setMonth(old.getMonth() - 25);
  await store.save(rec('34567890', old.toISOString()));
  check('超過保留期嘅紀錄唔會列出', (await store.listByPhone('34567890')).length === 0);

  const deleted = await store.deleteByPhone('91234567');
  check('刪除覆到實數（PDPO 回覆要講到刪咗幾多）', deleted === 2, String(deleted));
  check('刪完真係冇晒', (await store.listByPhone('91234567')).length === 0);
  check('刪一個人唔會累到第二個', (await store.listByPhone('21234567')).length === 1);

  console.log(failures === 0 ? '\n✅ 全部通過\n' : `\n❌ ${failures} 項失敗\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
