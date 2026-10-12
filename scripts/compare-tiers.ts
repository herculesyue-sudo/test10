/**
 * 「邊個模型最抵？」—— 用你自己啲相答，唔使醫生標註。
 *
 *   npm run compare -- --dir eval/photos
 *
 * ── 點解要有呢個 ──
 *
 * 「最平」同「最準」之間點揀，而家係靠估。最貴嗰個模型比最平嗰個貴 11 倍，
 * 但係咪真係準 11 倍？冇人知。可能 haiku 已經夠用（慳 91%），亦可能佢
 * 漏咗好緊要嘅嘢。
 *
 * 完整嘅準確度量度（scripts/eval.ts）需要醫生逐張相標註 —— 嗰個係幾十
 * 個鐘嘅醫生時間，好貴，而且要等。呢個 script 係中間方案：
 *
 *   用最強嘅模型做**參照標準**（唔係真理，但係目前最好嘅代理），
 *   睇下平嘅模型同佢差幾遠。
 *
 * 呢個答唔到「有幾準」，但答到**「平嗰個蝕咗幾多」**—— 而後者先係你
 * 而家要做嘅決定。三十張相、大約 HK$30 就有答案。
 *
 * ⚠️ 最重要嗰個數字唔係「整體一致率」，係**紅旗召回率**。
 *    一個平模型平均準確度差少少，通常唔緊要（醫生面診會執返）。
 *    但佢漏咗一粒可疑嘅痣，就係一件完全唔同性質嘅事。
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { analyzeWithConsensus, TIERS, type Tier, type ImageInput } from '../src/lib/anthropic';
import { FINDING_LABELS, type FindingKey } from '../src/lib/treatments/types';

const MIME: Record<string, ImageInput['mediaType']> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name: string) => process.argv.includes(`--${name}`);

interface Run {
  tier: Tier;
  findings: Map<FindingKey, number>; // key → severity
  redFlags: number;
  usable: boolean;
  costHKD: number;
}

/** Jaccard：兩邊都有嘅 ÷ 任何一邊有嘅。1 = 完全一致。 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const inter = [...a].filter((x) => b.has(x)).length;
  return inter / (a.size + b.size - inter);
}

async function main() {
  const dir = arg('dir', 'eval/photos');
  const passes = Number(arg('passes', '1'));
  const reference = arg('reference', 'max') as Tier;
  const tiers = arg('tiers', 'budget,balanced,max').split(',') as Tier[];

  if (!existsSync(dir)) {
    console.error(`\n搵唔到資料夾「${dir}」。`);
    console.error('放幾十張自拍相入去（jpg / png / webp）就可以行。');
    console.error('唔使標註 —— 呢個 script 係用最強模型做參照，唔使醫生落手。\n');
    process.exit(1);
  }

  const files = readdirSync(dir).filter((f) => extname(f).toLowerCase() in MIME);
  if (files.length === 0) {
    console.error(`「${dir}」入面冇相片。`);
    process.exit(1);
  }

  // ── 先報價，唔好靜靜雞燒錢 ──
  const est = files.length * passes * tiers.reduce((s, t) => s + (t === 'budget' ? 0.05 : t === 'balanced' ? 0.25 : 0.7), 0);
  console.log(`\n${files.length} 張相 × ${passes} 次 × ${tiers.length} 個模型`);
  console.log(`預計成本：約 HK$${est.toFixed(0)}`);
  if (!has('yes')) {
    console.log('\n確認冇問題就加 --yes 再行一次。\n');
    process.exit(0);
  }
  console.log('');

  const byFile = new Map<string, Run[]>();

  for (const [i, f] of files.entries()) {
    const images: ImageInput[] = [
      { data: readFileSync(join(dir, f)).toString('base64'), mediaType: MIME[extname(f).toLowerCase()], angle: '正面' },
    ];
    const runs: Run[] = [];
    process.stdout.write(`[${i + 1}/${files.length}] ${f} `);

    for (const tier of tiers) {
      try {
        const r = await analyzeWithConsensus({ images, goals: [], tier }, passes);
        runs.push({
          tier,
          findings: new Map(r.analysis.findings.map((x) => [x.key as FindingKey, x.severity])),
          redFlags: r.analysis.redFlags.length,
          usable: r.analysis.imageQuality.usable,
          costHKD: r.costHKD,
        });
        process.stdout.write(`${tier[0]}✓ `);
      } catch (e) {
        process.stdout.write(`${tier[0]}✗ `);
        console.error(`\n  ${tier} 失敗：${(e as Error).message}`);
      }
    }
    console.log('');
    byFile.set(f, runs);
  }

  // ── 統計 ──
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  參照標準：${reference}（${TIERS[reference].model}）`);
  console.log('══════════════════════════════════════════════════\n');

  const cmp = tiers.filter((t) => t !== reference);
  const rows: { tier: Tier; agree: number; sevDiff: number; missedFlags: number; extraFlags: number; refFlags: number; cost: number; n: number }[] = [];

  for (const tier of tiers) {
    let agreeSum = 0;
    let sevSum = 0;
    let sevN = 0;
    let missed = 0;
    let extra = 0;
    let refFlagTotal = 0;
    let cost = 0;
    let n = 0;

    for (const runs of byFile.values()) {
      const ref = runs.find((r) => r.tier === reference);
      const cur = runs.find((r) => r.tier === tier);
      if (!ref || !cur) continue;
      n++;
      cost += cur.costHKD;
      agreeSum += jaccard(new Set(ref.findings.keys()), new Set(cur.findings.keys()));
      for (const [k, sev] of ref.findings) {
        const mine = cur.findings.get(k);
        if (mine !== undefined) {
          sevSum += Math.abs(mine - sev);
          sevN++;
        }
      }
      refFlagTotal += ref.redFlags;
      if (ref.redFlags > 0 && cur.redFlags === 0) missed++;
      if (ref.redFlags === 0 && cur.redFlags > 0) extra++;
    }

    rows.push({
      tier,
      agree: n ? agreeSum / n : 0,
      sevDiff: sevN ? sevSum / sevN : 0,
      missedFlags: missed,
      extraFlags: extra,
      refFlags: refFlagTotal,
      cost,
      n,
    });
  }

  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - [...s].length));
  console.log(pad('模型', 12) + pad('特徵一致率', 13) + pad('嚴重度差', 10) + pad('總成本', 11) + '每張');
  console.log('─'.repeat(58));
  for (const r of rows) {
    const isRef = r.tier === reference;
    console.log(
      pad(r.tier + (isRef ? ' ★' : ''), 12) +
        pad(isRef ? '（參照）' : `${(r.agree * 100).toFixed(0)}%`, 13) +
        pad(isRef ? '—' : r.sevDiff.toFixed(1), 10) +
        pad(`HK$${r.cost.toFixed(2)}`, 11) +
        `HK$${(r.cost / Math.max(1, r.n)).toFixed(3)}`,
    );
  }

  // ── 紅旗：呢個先係決定性嘅數字 ──
  const refFlags = rows.find((r) => r.tier === reference)?.refFlags ?? 0;
  console.log('\n─ 紅旗（可疑病灶）──────────────────────────');
  if (refFlags === 0) {
    console.log(`  參照模型喺呢批相入面一個紅旗都冇出。`);
    console.log(`  ⚠️  即係話呢個測試**驗證唔到**平模型會唔會漏報。`);
    console.log(`     想測到，就要喺相堆入面加幾張真係有可疑痣 / 病灶嘅相。`);
  } else {
    console.log(`  參照模型出咗 ${refFlags} 個紅旗。`);
    for (const r of rows) {
      if (r.tier === reference) continue;
      const verdict = r.missedFlags === 0 ? '✅ 冇漏' : `🔴 漏咗 ${r.missedFlags} 個`;
      console.log(`  ${pad(r.tier, 10)} ${verdict}${r.extraFlags ? `（另外多報 ${r.extraFlags} 個）` : ''}`);
    }
    console.log('\n  漏報一個都唔應該接受。多報係可以接受嘅 —— 客人白行一趟皮膚科,');
    console.log('  同漏咗一個可能係皮膚癌嘅病灶，唔係同一個量級嘅代價。');
  }

  // ── 結論 ──
  console.log('\n─ 點揀 ────────────────────────────────────');
  const cheap = rows.find((r) => r.tier === 'budget');
  const mid = rows.find((r) => r.tier === 'balanced');
  const ref = rows.find((r) => r.tier === reference)!;
  if (cheap && ref.cost > 0) {
    const save = (1 - cheap.cost / ref.cost) * 100;
    console.log(`  budget 比 ${reference} 慳 ${save.toFixed(0)}%，特徵一致率 ${(cheap.agree * 100).toFixed(0)}%`);
  }
  if (mid && ref.cost > 0) {
    const save = (1 - mid.cost / ref.cost) * 100;
    console.log(`  balanced 比 ${reference} 慳 ${save.toFixed(0)}%，特徵一致率 ${(mid.agree * 100).toFixed(0)}%`);
  }
  console.log('');
  console.log('  一致率 85%+ ：平嗰個夠用，慳到嘅錢係淨賺');
  console.log('  一致率 70–85%：客人免費版用平嘅，到診之後用貴嘅再跑一次');
  console.log('  一致率 <70% ：唔好慳，差異已經大到會影響客人見到嘅建議');
  console.log('');
  console.log('  ⚠️ 呢個係「同最強模型有幾似」，唔係「有幾準」。');
  console.log('     要知真實準確度，仍然要醫生標註 → npm run eval\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
