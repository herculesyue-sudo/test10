/**
 * 準確度量度工具。
 *
 * 「準確度 >90%」唔可以靠聲稱，只可以靠量。呢個 script 攞一組
 * 由醫生標註過嘅相片（ground truth），逐張跑分析，然後計：
 *
 *   - Detection F1  : 有問題嘅特徵，AI 有冇捉到（漏咗 = false negative）
 *   - Severity MAE  : 捉到之後，嚴重程度差幾多分
 *   - Calibration   : AI 話自己「信心 0.8」嗰批，實際命中率係咪真係 ~80%
 *
 * 校準（calibration）比原始準確率更重要：一個知道自己幾時唔肯定嘅系統，
 * 可以安全咁話客人「呢項要現場再睇」；一個永遠好自信嘅系統會誤導人。
 *
 * 用法：
 *   1. 準備 eval/dataset.json（格式見下面 EvalCase）
 *   2. 相片放喺 eval/images/
 *   3. npm run eval -- --tier balanced --passes 1
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { analyzeWithConsensus, TIERS, type Tier } from '../src/lib/anthropic';
import { FINDING_LABELS, type FindingKey } from '../src/lib/treatments/types';

interface EvalCase {
  id: string;
  /** 相對 eval/images/ 嘅檔名 */
  images: { file: string; angle: string }[];
  goals?: string[];
  age?: number;
  gender?: string;
  /** 醫生標註：只列出真係存在嘅特徵及其嚴重程度 0-100 */
  truth: { key: FindingKey; severity: number }[];
}

const DATASET = 'eval/dataset.json';
const IMAGE_DIR = 'eval/images';

/** 嚴重程度 ≥ 呢個分數就當「呢個特徵存在」，用嚟計 detection。 */
const PRESENCE_THRESHOLD = 30;
/** 嚴重程度差距喺呢個範圍內，就當「評分正確」。 */
const SEVERITY_TOLERANCE = 20;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const MIME: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function main() {
  const tier = arg('tier', 'balanced') as Tier;
  const passes = Number(arg('passes', '1'));

  if (!(tier in TIERS)) {
    console.error(`未知 tier「${tier}」。可選：${Object.keys(TIERS).join(' / ')}`);
    process.exit(1);
  }
  if (!existsSync(DATASET)) {
    console.error(`搵唔到 ${DATASET}。

請建立標註資料集，格式如下：

[
  {
    "id": "case-001",
    "images": [{ "file": "001-front.jpg", "angle": "正面" }],
    "age": 34,
    "gender": "女",
    "truth": [
      { "key": "pigmentation", "severity": 55 },
      { "key": "nasolabial_fold", "severity": 40 }
    ]
  }
]

相片放喺 ${IMAGE_DIR}/。truth 只列出真係存在嘅特徵 —— 冇列出嘅當作唔存在。
建議最少 40–60 個個案，並由 2 位醫生獨立標註後取共識，先有統計意義。`);
    process.exit(1);
  }

  const cases: EvalCase[] = JSON.parse(readFileSync(DATASET, 'utf8'));
  console.log(`\n模型：${TIERS[tier].model}（${TIERS[tier].label}）· ${passes} 次分析 · ${cases.length} 個個案\n`);

  let tp = 0;
  let fp = 0;
  let fn = 0;
  const sevErrors: number[] = [];
  /** 信心分桶 → [命中數, 總數] */
  const calib = new Map<string, [number, number]>();
  const perKey = new Map<FindingKey, { tp: number; fp: number; fn: number }>();
  let totalCost = 0;
  let failed = 0;

  for (const [i, c] of cases.entries()) {
    process.stdout.write(`[${i + 1}/${cases.length}] ${c.id} … `);
    try {
      const images = c.images.map((im) => {
        const p = join(IMAGE_DIR, im.file);
        const mediaType = MIME[extname(im.file).toLowerCase()];
        if (!mediaType) throw new Error(`唔支援嘅圖片格式：${im.file}`);
        return { data: readFileSync(p).toString('base64'), mediaType, angle: im.angle };
      });

      const res = await analyzeWithConsensus(
        { images, goals: c.goals ?? [], age: c.age, gender: c.gender, tier },
        passes,
      );
      totalCost += res.costHKD;

      const truthMap = new Map(c.truth.filter((t) => t.severity >= PRESENCE_THRESHOLD).map((t) => [t.key, t.severity]));
      const predMap = new Map(
        res.analysis.findings
          .filter((f) => f.severity >= PRESENCE_THRESHOLD)
          .map((f) => [f.key as FindingKey, f]),
      );

      const keys = new Set<FindingKey>([...truthMap.keys(), ...predMap.keys()]);
      for (const k of keys) {
        const t = truthMap.get(k);
        const p = predMap.get(k);
        const stat = perKey.get(k) ?? { tp: 0, fp: 0, fn: 0 };

        if (t != null && p) {
          tp++;
          stat.tp++;
          const err = Math.abs(t - p.severity);
          sevErrors.push(err);

          const bucket = `${Math.floor(p.confidence * 5) * 20}-${Math.floor(p.confidence * 5) * 20 + 20}%`;
          const cur = calib.get(bucket) ?? [0, 0];
          cur[1]++;
          if (err <= SEVERITY_TOLERANCE) cur[0]++;
          calib.set(bucket, cur);
        } else if (p) {
          fp++;
          stat.fp++;
          const bucket = `${Math.floor(p.confidence * 5) * 20}-${Math.floor(p.confidence * 5) * 20 + 20}%`;
          const cur = calib.get(bucket) ?? [0, 0];
          cur[1]++;
          calib.set(bucket, cur);
        } else {
          fn++;
          stat.fn++;
        }
        perKey.set(k, stat);
      }
      console.log(`✓ 命中 ${[...keys].filter((k) => truthMap.has(k) && predMap.has(k)).length}/${truthMap.size}`);
    } catch (e) {
      failed++;
      console.log(`✗ ${(e as Error).message}`);
    }
  }

  const precision = tp / Math.max(tp + fp, 1);
  const recall = tp / Math.max(tp + fn, 1);
  const f1 = (2 * precision * recall) / Math.max(precision + recall, 1e-9);
  const mae = sevErrors.reduce((a, b) => a + b, 0) / Math.max(sevErrors.length, 1);
  const within = sevErrors.filter((e) => e <= SEVERITY_TOLERANCE).length / Math.max(sevErrors.length, 1);

  console.log('\n' + '═'.repeat(58));
  console.log('特徵偵測');
  console.log(`  精確率 Precision  ${(precision * 100).toFixed(1)}%   (捉到嘅入面有幾多係真)`);
  console.log(`  召回率 Recall     ${(recall * 100).toFixed(1)}%   (真實存在嘅入面捉到幾多)`);
  console.log(`  F1                ${(f1 * 100).toFixed(1)}%`);
  console.log(`  TP ${tp} · FP ${fp} · FN ${fn}`);
  console.log('\n嚴重程度評分');
  console.log(`  平均絕對誤差 MAE  ${mae.toFixed(1)} 分`);
  console.log(`  誤差 ≤${SEVERITY_TOLERANCE} 分比例  ${(within * 100).toFixed(1)}%`);

  console.log('\n信心校準（理想情況：兩欄數字應該接近）');
  for (const b of [...calib.keys()].sort()) {
    const [hit, n] = calib.get(b)!;
    console.log(`  自報信心 ${b.padEnd(9)} → 實際準確 ${((hit / n) * 100).toFixed(0).padStart(3)}%  (n=${n})`);
  }

  const worst = [...perKey.entries()]
    .map(([k, s]) => ({ k, f1: (2 * s.tp) / Math.max(2 * s.tp + s.fp + s.fn, 1), n: s.tp + s.fn }))
    .filter((x) => x.n >= 3)
    .sort((a, b) => a.f1 - b.f1)
    .slice(0, 5);

  if (worst.length) {
    console.log('\n表現最差嘅特徵（優先改善 prompt）');
    for (const w of worst) {
      console.log(`  ${(FINDING_LABELS[w.k] ?? w.k).padEnd(16)} F1 ${(w.f1 * 100).toFixed(0)}%  (n=${w.n})`);
    }
  }

  console.log('\n成本');
  console.log(`  總計 HK$${totalCost.toFixed(2)} · 平均每個案 HK$${(totalCost / Math.max(cases.length - failed, 1)).toFixed(3)}`);
  if (failed) console.log(`  ⚠️ ${failed} 個個案失敗`);
  console.log('═'.repeat(58) + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
