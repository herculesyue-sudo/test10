/**
 * 由一份「AI 觀察結果」直接出客人報告 —— 唔使 API key、唔使部署。
 *
 *   npm run report -- --in analysis.json --html report.html
 *
 * ── 用嚟做咩 ──
 *
 * 個系統嘅視覺分析同療程配對本來就係分開嘅（見 README「架構」）。
 * 平時「睇相」嗰步由 Anthropic API 做，但嗰步嘅**輸出係一份 JSON**，
 * 而 JSON 邊個寫都可以 —— 包括一個直接睇住張相嘅人／模型。
 *
 * 所以喺仲未部署、仲未有 API key 嘅階段，可以咁樣用：
 *
 *   1. 攞張相俾一個有視覺能力嘅 Claude，叫佢跟 src/lib/prompt.ts 嘅
 *      系統提示，輸出一份符合 src/lib/schema.ts 嘅 JSON
 *   2. 行呢個 script
 *   3. 出到嘅報告，同客人喺正式版見到嗰份**一模一樣**
 *
 * 因為第 2、3 步行嘅係同一份 postProcess / usabilityVerdict /
 * matchTreatments —— 冇任何一段係為咗呢個 script 另外寫。
 *
 * ⚠️ 呢個唔會取代部署：客人自己上網用嗰陣，冇人可以幫佢做第 1 步。
 *    呢個係俾診所自己而家就試到真實個案。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { AnalysisSchema } from '../src/lib/schema';
import { postProcess, usabilityVerdict } from '../src/lib/postprocess';
import { matchTreatments, MIN_PRESENTABLE_SCORE, type Finding } from '../src/lib/treatments';
import {
  GOALS,
  FINDING_LABELS,
  CATEGORY_LABELS,
  CATEGORY_EXPLAIN,
  type GoalKey,
  type FindingKey,
  type TreatmentCategory,
} from '../src/lib/treatments/types';
import { CLINIC_POLICY, CLINIC_OTHER_SERVICES } from '../src/lib/treatments/clinic';

function arg(name: string, fallback = ''): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const inFile = arg('in');
if (!inFile) {
  console.error(`
用法：npm run report -- --in analysis.json [--goals lift,brighten] [--html report.html]

analysis.json 要符合 src/lib/schema.ts 嘅格式。
可以揀嘅目標：${GOALS.map((g) => g.key).join(', ')}
`);
  process.exit(1);
}

const goals = arg('goals')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((g): g is GoalKey => GOALS.some((x) => x.key === g));

const pregnant = process.argv.includes('--pregnant');

// ── 驗證 ──
// 用返同一個 zod schema。手寫嘅 JSON 好易漏欄位或者用錯 key，
// 喺呢度炸好過出咗一份靜靜雞唔完整嘅報告。
const raw = JSON.parse(readFileSync(inFile, 'utf8'));
const parsed = AnalysisSchema.safeParse(raw);
if (!parsed.success) {
  console.error('\n❌ analysis.json 唔符合 schema：\n');
  for (const issue of parsed.error.issues) {
    console.error(`  · ${issue.path.join('.') || '(根)'} → ${issue.message}`);
  }
  console.error('\n格式見 src/lib/schema.ts。\n');
  process.exit(1);
}

// ── 行真嘅流程 ──
const { analysis, adjustments } = postProcess(parsed.data);
const usability = usabilityVerdict(analysis);
const findings: Finding[] = analysis.findings.map((f) => ({
  key: f.key as FindingKey,
  severity: f.severity,
  confidence: f.confidence,
  observation: f.observation,
  location: f.location,
}));
const scored = matchTreatments({ findings, goals, isPregnantOrNursing: pregnant });
const recs = scored.filter((r) => r.score >= MIN_PRESENTABLE_SCORE).slice(0, 3);

// ── 終端機摘要 ──
const band = (s: number) => (s >= 66 ? '明顯' : s >= 41 ? '中度' : '輕微');
console.log('\n══════════════════════════════════════════');
console.log(`  ${CLINIC_POLICY.name} · 面部分析報告`);
console.log('══════════════════════════════════════════\n');

if (analysis.redFlags.length) {
  console.log('⚠️  建議先睇醫生');
  for (const f of analysis.redFlags) console.log(`   · ${f}`);
  console.log('');
}
if (!usability.ok) console.log(`⚠️  ${usability.reason}\n`);
else if (analysis.imageQuality.makeupDetected) console.log('⚠️  偵測到化妝，色斑同泛紅嘅判斷會冇咁準\n');

console.log(analysis.overallSummary + '\n');
console.log('─ 觀察 ─');
for (const f of analysis.findings.slice(0, 6)) {
  console.log(
    `  ${(FINDING_LABELS[f.key as FindingKey] ?? f.key).padEnd(14)} ` +
      `${band(f.severity).padEnd(3)} ${String(f.severity).padStart(3)}/100  信心 ${Math.round(f.confidence * 100)}%`,
  );
}

console.log('\n─ 建議療程 ─');
if (recs.length === 0) {
  console.log(pregnant ? '  （懷孕／哺乳期間所有療程都過濾咗）' : '  （觀察唔到需要療程介入嘅明顯問題）');
}
for (const [i, r] of recs.entries()) {
  console.log(`  ${i + 1}. [${r.score}] ${r.treatment.name}  · ${CATEGORY_LABELS[r.treatment.category]}`);
  console.log(`     ${r.rationale}`);
}

if (adjustments.length) {
  console.log(`\n─ 後處理修正 ${adjustments.length} 項（客人唔會見到）─`);
  for (const a of adjustments) console.log(`  · ${a.rule}: ${a.detail}`);
}

// ── HTML 報告 ──
const htmlOut = arg('html');
if (htmlOut) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const dt = (d: [number, number]) => (d[1] === 0 ? '冇停工期' : d[0] === 0 ? `最多 ${d[1]} 日` : `${d[0]}–${d[1]} 日`);
  const ORDER: TreatmentCategory[] = ['device', 'injectable', 'topical'];
  const kinds = ORDER.map((c) => ({ c, n: recs.filter((r) => r.treatment.category === c).length })).filter((k) => k.n);

  writeFileSync(
    htmlOut,
    `<meta name="viewport" content="width=device-width,initial-scale=1">
<meta charset="utf-8"><title>${esc(CLINIC_POLICY.name)} 面部分析報告</title>
<style>
:root{--bg:#fbfaf8;--s:#fff;--s2:#f4f2ee;--b:#e3ded6;--t:#1c1a17;--d:#6b6459;--a:#9a5b3f;--as:#f2e4dc;--w:#a8781f;--r:#b03a2e}
@media(prefers-color-scheme:dark){:root{--bg:#16150f;--s:#201e18;--s2:#2a2721;--b:#3a352c;--t:#f0ece4;--d:#a49b8c;--a:#d99872;--as:#3a2a20;--w:#d9b25f;--r:#e08074}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t);line-height:1.65;
font-family:-apple-system,BlinkMacSystemFont,'PingFang HK','Noto Sans HK',sans-serif}
.w{max-width:620px;margin:0 auto;padding:24px 16px 60px}
h1{font-size:1.4rem;margin:0 0 4px}.sub{color:var(--d);font-size:.86rem;margin:0 0 20px}
.c{background:var(--s);border:1px solid var(--b);border-radius:14px;padding:18px;margin-bottom:14px}
.c h2{margin:0 0 10px;font-size:1.02rem}
.al{border-radius:10px;padding:12px 14px;font-size:.85rem;margin-bottom:12px}
.al.r{background:color-mix(in srgb,var(--r) 12%,transparent);border:1px solid var(--r)}
.al.w{background:color-mix(in srgb,var(--w) 12%,transparent);border:1px solid var(--w)}
.f{padding:12px 0;border-bottom:1px solid var(--b)}.f:last-child{border-bottom:0}
.f .tp{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.f .tp b{font-size:.93rem}.f .tp em{font-style:normal;font-size:.75rem;color:var(--d);white-space:nowrap}
.bar{height:6px;border-radius:3px;background:var(--b);overflow:hidden;margin-top:5px}
.bar i{display:block;height:100%;background:var(--a)}
.f p{margin:6px 0 0;font-size:.84rem;color:var(--d)}
.k{display:inline-block;font-size:.67rem;letter-spacing:.05em;color:var(--a);border:1px solid var(--b);
border-radius:999px;padding:2px 9px;margin-bottom:6px}
.rec{border:1px solid var(--b);border-radius:11px;padding:14px;margin-bottom:10px;background:var(--s2)}
.rec b.n{display:block;font-size:.96rem}.rec>p{margin:8px 0 9px;font-size:.85rem}
.note{font-size:.79rem;color:var(--d);margin:0 0 9px}
.m{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:.77rem;color:var(--d)}
.m b{color:var(--t)}
.kinds{border:1px solid var(--b);border-radius:11px;padding:12px 14px;margin-bottom:12px;background:var(--s2)}
.kinds p{margin:0 0 6px;font-size:.82rem;color:var(--d)}.kinds .l{font-size:.9rem;color:var(--t)}
.dis{font-size:.75rem;color:var(--d);line-height:1.6;margin-top:18px}
</style>
<div class="w">
<h1>你嘅分析結果</h1><p class="sub">${esc(CLINIC_POLICY.name)}</p>
${analysis.redFlags.length ? `<div class="al r"><b>⚠️ 建議先睇醫生</b><ul style="margin:6px 0 0;padding-left:18px">${analysis.redFlags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
${!usability.ok ? `<div class="al w"><b>⚠️ ${esc(usability.reason ?? '')}</b><p style="margin:6px 0 0;font-size:.84rem">下面嘅結果參考價值有限，重影一張會準確好多。</p></div>` : analysis.imageQuality.makeupDetected ? `<div class="al w">偵測到化妝 —— 色斑同泛紅嘅判斷會冇咁準。素顏重拍會準確好多。</div>` : ''}
<div class="c"><h2>我哋睇到咩</h2><p style="margin:0 0 14px;font-size:.92rem">${esc(analysis.overallSummary)}</p>
${[...analysis.findings].sort((a, b) => b.severity - a.severity).slice(0, 4).map((f) => `<div class="f"><div class="tp"><b>${esc(FINDING_LABELS[f.key as FindingKey] ?? f.key)}</b><em>${band(f.severity)} · 信心 ${Math.round(f.confidence * 100)}%</em></div><div class="bar"><i style="width:${f.severity}%"></i></div><p>${esc(f.observation)}</p></div>`).join('')}
</div>
<div class="c"><h2>建議療程方向</h2>
<p class="sub">以下全部係 ${esc(CLINIC_POLICY.name)} 實際提供嘅療程。${esc(CLINIC_POLICY.payPerSessionNote)}。</p>
${recs.length === 0 ? (pregnant ? `<div class="al w" style="margin:0"><b>因為懷孕／餵人奶，所有療程都暫時過濾咗。</b><p style="margin:6px 0 0;font-size:.84rem">激光、射頻、肉毒同填充喺呢段時間都唔適合 —— 呢個係正常同安全嘅做法，唔代表你塊面冇嘢可以做。</p></div>` : `<p style="font-size:.87rem;color:var(--d);margin:0">觀察唔到需要療程介入嘅明顯問題。想更深入評估，歡迎預約面診。</p>`) : ''}
${kinds.length ? `<div class="kinds"><p class="l">你嘅方案包括 ${kinds.map((k) => `<b>${k.n} 個${CATEGORY_LABELS[k.c]}</b>`).join('、')}。</p>${kinds.map((k) => `<p><b>${CATEGORY_LABELS[k.c]}</b>：${CATEGORY_EXPLAIN[k.c]}</p>`).join('')}</div>` : ''}
${recs.map((r, i) => `<div class="rec"><div class="k">${CATEGORY_LABELS[r.treatment.category]}</div><b class="n">${i + 1}. ${esc(r.treatment.name)}</b><p>${esc(r.rationale)}</p>${r.treatment.notes ? `<p class="note">📌 ${esc(r.treatment.notes)}</p>` : ''}<div class="m"><span>次數：<b>${esc(r.treatment.sessions)}</b></span><span>見效：<b>${esc(r.treatment.onset)}</b></span><span>維持：<b>${esc(r.treatment.duration)}</b></span><span>停工期：<b>${dt(r.treatment.downtimeDays)}</b></span></div></div>`).join('')}
</div>
<div class="c"><h2>其他服務</h2><p class="sub">呢啲服務唔可以靠相片評估，需要醫生現場檢查。</p>
${CLINIC_OTHER_SERVICES.map((s) => `<div class="f"><div class="tp"><b>${esc(s.name)}</b></div><p>${esc(s.note)}</p></div>`).join('')}</div>
<p class="dis">呢份報告由 AI 根據相片產生，屬<b>初步參考</b>，並非醫學診斷，唔可以取代註冊醫生嘅面對面檢查。
光線、角度、化妝都會影響判斷。喺香港，注射類療程須由<b>註冊醫生</b>施行；所有療程均須經<b>註冊醫生</b>評估。療程收費請直接向診所查詢。</p>
</div>`,
    'utf8',
  );
  console.log(`\n📄 HTML 報告：${htmlOut}`);
}
console.log('');
