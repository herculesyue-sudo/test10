/**
 * 療程配對引擎嘅離線測試（唔使 API key）。
 *
 * 用假嘅分析結果去驗證規則引擎：排序合唔合理、過濾有冇生效、
 * 分階段方案有冇將注射類擺去最後。呢啲係唔應該靠模型輸出去測嘅嘢。
 *
 * npm run test:engine
 */

import { matchTreatments, buildPhasedPlan, ALL_TREATMENTS, FINDING_LABELS } from '../src/lib/treatments';
import type { Finding, FindingKey } from '../src/lib/treatments';

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
  check(`已收錄 ${ALL_TREATMENTS.length} 個療程（≥30）`, ALL_TREATMENTS.length >= 30);
  const badKey = ALL_TREATMENTS.flatMap((t) => t.indications).find((i) => !(i.key in FINDING_LABELS));
  check('所有適應症 key 都合法', !badKey, badKey ? `未知 key: ${badKey.key}` : '');
  const noPrice = ALL_TREATMENTS.find((t) => t.priceHKD.min <= 0 || t.priceHKD.max < t.priceHKD.min);
  check('所有價格區間合理', !noPrice, noPrice?.id);
  const noContra = ALL_TREATMENTS.filter((t) => t.contraindications.length === 0);
  check('所有療程都有列禁忌', noContra.length === 0, noContra.map((t) => t.id).join(', '));
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
    ['picolaser', 'laser-toning', 'ipl-m22', 'sylfirm'].includes(out[0]?.treatment.id),
    out[0]?.treatment.id,
  );
  check('唔會推薦無關嘅瘦面針', !out.slice(0, 5).some((r) => r.treatment.id === 'btx-masseter'));
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
  const totalMin = plan.reduce((s, p) => s + p.subtotalHKD.min, 0);
  check('預算估算 > 0', totalMin > 0, `HK$${totalMin}`);
}

console.log('\n── 個案 C：懷孕中（安全過濾） ──');
{
  const findings = [f('skin_laxity', 70), f('pigmentation', 60), f('masseter_hypertrophy', 65)];
  const normal = matchTreatments({ findings, goals: [] });
  const pregnant = matchTreatments({ findings, goals: [], isPregnantOrNursing: true });
  console.log(`  一般 ${normal.length} 項 → 懷孕 ${pregnant.length} 項`);
  check('推薦數量減少', pregnant.length < normal.length);
  check('完全排除肉毒', !pregnant.some((r) => r.treatment.family.includes('肉毒')));
  check('完全排除激光', !pregnant.some((r) => r.treatment.id === 'picolaser'));
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
  check('仍然有儀器類可選', out.length >= 3, `只有 ${out.length} 項`);
}

console.log('\n── 個案 E：低信心唔應該拉高分數 ──');
{
  const high = matchTreatments({ findings: [f('acne_scar', 70, 0.9)], goals: [] });
  const low = matchTreatments({ findings: [f('acne_scar', 70, 0.25)], goals: [] });
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
    findings: [f('acne_scar', 80), f('texture', 70)],
    goals: ['clear_acne'],
    maxDowntimeDays: 1,
    budgetHKD: 3000,
  });
  const co2 = out.find((r) => r.treatment.id === 'co2-fractional');
  check('CO2 激光有停工期警示', Boolean(co2?.flags.some((x) => x.includes('停工期'))));
  check('有預算超支警示', out.some((r) => r.flags.some((x) => x.includes('預算'))));
}

console.log(failures === 0 ? '\n✅ 全部通過\n' : `\n❌ ${failures} 項失敗\n`);
process.exit(failures === 0 ? 0 : 1);
