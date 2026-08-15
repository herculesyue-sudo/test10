/**
 * 診所療程目錄健康檢查。
 *
 * 回答三條問題：
 *   1. 邊啲療程仲未有真實價錢？（UI 會顯示「請洽診所」，成單生意就冇咗個 hook）
 *   2. 邊啲條目仲有「待補充」之類嘅佔位文字？（呢啲會直接出現喺客人面前）
 *   3. AI 偵測得到、但診所冇療程做嘅問題有邊啲？（客人問完，你冇嘢賣佢）
 *
 * 第 3 點最容易被忽略：AI 可以偵測 35 種特徵，但如果目錄冇對應療程，
 * 個報告就會指出問題然後靜靜咁冇下文 —— 對客人同對診所都係浪費。
 *
 * npm run check:catalogue
 */

import { CLINIC_TREATMENTS, CLINIC_OTHER_SERVICES, CLINIC_POLICY } from '../src/lib/treatments/clinic';
import { FINDING_LABELS, type FindingKey } from '../src/lib/treatments/types';
import { isPriceConfirmed } from '../src/lib/treatments';

const PLACEHOLDER = /待補充|待確認|TBC|TODO|⚠️|XXX/;

console.log(`\n${'═'.repeat(62)}`);
console.log(`  ${CLINIC_POLICY.name} 療程目錄檢查`);
console.log(`${'═'.repeat(62)}\n`);

console.log(`療程總數：${CLINIC_TREATMENTS.length}`);
console.log(`其他服務：${CLINIC_OTHER_SERVICES.length}（唔入配對引擎）\n`);

// ── 1. 價錢 ──
const unpriced = CLINIC_TREATMENTS.filter((t) => !isPriceConfirmed(t));
console.log(`─ 價錢 ─`);
if (unpriced.length === 0) {
  console.log('  ✓ 全部療程都有已核實價錢\n');
} else {
  console.log(`  ⚠️  ${unpriced.length}/${CLINIC_TREATMENTS.length} 個未有真實價錢，客人會見到「請洽診所」：`);
  for (const t of unpriced) console.log(`     · ${t.name.padEnd(20)} (${t.id})`);
  console.log(`     → 喺 src/lib/treatments/clinic.ts 填 priceHKD 並將 priceStatus 改做 'confirmed'\n`);
}

// ── 2. 佔位文字 ──
console.log(`─ 未完成嘅內容 ─`);
const withPlaceholder = CLINIC_TREATMENTS.filter((t) =>
  [t.mechanism, t.sessions, t.interval, t.onset, t.duration, t.regulation, t.notes ?? '', t.brand].some((v) =>
    PLACEHOLDER.test(v),
  ),
);
if (withPlaceholder.length === 0) {
  console.log('  ✓ 冇佔位文字\n');
} else {
  console.log(`  ⚠️  ${withPlaceholder.length} 個條目仲有「待補充」之類嘅字，會直接出現喺報告：`);
  for (const t of withPlaceholder) {
    const fields = (
      [
        ['mechanism', t.mechanism],
        ['sessions', t.sessions],
        ['interval', t.interval],
        ['onset', t.onset],
        ['duration', t.duration],
        ['regulation', t.regulation],
        ['notes', t.notes ?? ''],
        ['brand', t.brand],
      ] as [string, string][]
    )
      .filter(([, v]) => PLACEHOLDER.test(v))
      .map(([k]) => k);
    console.log(`     · ${t.name.padEnd(20)} → ${fields.join(', ')}`);
  }
  console.log('');
}

// 品牌未填
const noBrand = CLINIC_TREATMENTS.filter((t) => !t.brand.trim());
if (noBrand.length) {
  console.log(`  ⚠️  ${noBrand.length} 個療程未填品牌 / 儀器名（客人好多時就係想知用咩牌子）：`);
  for (const t of noBrand) console.log(`     · ${t.name} (${t.id})`);
  console.log('');
}

// ── 3. 覆蓋缺口 ──
console.log(`─ 覆蓋缺口 ─`);
const coverage = new Map<FindingKey, number>();
for (const t of CLINIC_TREATMENTS) {
  for (const ind of t.indications) {
    coverage.set(ind.key, Math.max(coverage.get(ind.key) ?? 0, ind.efficacy));
  }
}

const allKeys = Object.keys(FINDING_LABELS) as FindingKey[];
const uncovered = allKeys.filter((k) => !coverage.has(k));
const weak = allKeys.filter((k) => (coverage.get(k) ?? 0) > 0 && (coverage.get(k) ?? 0) <= 2);

console.log(`  AI 偵測得到 ${allKeys.length} 種特徵，目錄覆蓋 ${coverage.size} 種\n`);

if (uncovered.length) {
  console.log(`  🔴 完全冇療程覆蓋（${uncovered.length} 種）—— AI 會指出問題，但唔會有任何建議：`);
  for (const k of uncovered) console.log(`     · ${FINDING_LABELS[k]}`);
  console.log('');
  console.log('     兩個處理方向：');
  console.log('       (a) 診所其實做到 → 加入 clinic.ts（可由 reference/ 複製模板）');
  console.log('       (b) 診所真係唔做 → 冇問題，但要接受客人會攞住呢個結果去第二間');
  console.log('');
}

if (weak.length) {
  console.log(`  🟡 只有輔助級療程（療效 ≤2，${weak.length} 種）：`);
  for (const k of weak) console.log(`     · ${FINDING_LABELS[k]}`);
  console.log('');
}

if (!uncovered.length && !weak.length) console.log('  ✓ 全部特徵都有主力療程覆蓋\n');

// ── 總結 ──
const blocking = unpriced.length + withPlaceholder.length;
console.log('═'.repeat(62));
if (blocking === 0 && uncovered.length === 0) {
  console.log('  ✅ 目錄已經可以上線');
} else {
  console.log(`  ⚠️  上線前建議處理：${unpriced.length} 個價錢、${withPlaceholder.length} 個未完成內容、${uncovered.length} 個覆蓋缺口`);
}
console.log('═'.repeat(62) + '\n');
