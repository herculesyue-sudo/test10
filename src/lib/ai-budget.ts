import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Like } from './visits-d1';

/**
 * 每月 AI 使費計量 + 硬上限。
 *
 * 點解要有：Vertex AI 係後付（月尾扣卡數），冇上限嘅話俾人玩爛先知
 * 蝕咗幾多。呢度用每次分析回傳嘅真實 token 數（meta.costHKD 同一來源）
 * 累加落 D1，非職員請求去到預算即刻停 —— 「最壞情況蝕幾多」由呢層
 * 鎖死，唔靠記憶體 ratelimit（Workers 每個 isolate 會重置）。
 *
 * 個數係估算（我哋自己計 token × 牌價），同 Google 實際帳單可能有輕微
 * 出入 —— 後台 UI 會註明「以 Google 帳單為準」。權威警報係 GCP 預算
 * 電郵（console.cloud.google.com/billing 人手設定）。
 */

/** 預算（HK$/月）。wrangler.jsonc vars MONTHLY_AI_BUDGET_HKD；冇設就 200。 */
export function monthlyBudgetHKD(): number {
  const n = Number(process.env.MONTHLY_AI_BUDGET_HKD ?? 200);
  return Number.isFinite(n) && n > 0 ? n : 200;
}

/** 月 key（UTC，YYYY-MM）。月轉 = 新一行 = 自動恢復。 */
export function monthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export interface SpendSnapshot {
  costHKD: number;
  analyses: number;
  inputTokens: number;
  outputTokens: number;
}

export interface SpendStore {
  /** false = 記憶體（本機 dev），重啟就重置 */
  readonly persistent: boolean;
  add(month: string, costHKD: number, inputTokens: number, outputTokens: number): Promise<void>;
  month(month: string): Promise<SpendSnapshot>;
}

const ZERO: SpendSnapshot = { costHKD: 0, analyses: 0, inputTokens: 0, outputTokens: 0 };

const DDL = `CREATE TABLE IF NOT EXISTS ai_spend (
  month         TEXT PRIMARY KEY,
  cost_hkd      REAL NOT NULL DEFAULT 0,
  analyses      INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL
)`;

class D1SpendStore implements SpendStore {
  readonly persistent = true;
  private ready: Promise<void> | null = null;

  constructor(private db: D1Like) {}

  private ensure(): Promise<void> {
    if (!this.ready) this.ready = this.db.prepare(DDL).run().then(() => undefined);
    return this.ready;
  }

  async add(month: string, costHKD: number, inputTokens: number, outputTokens: number): Promise<void> {
    await this.ensure();
    await this.db
      .prepare(
        `INSERT INTO ai_spend (month, cost_hkd, analyses, input_tokens, output_tokens, updated_at)
         VALUES (?, ?, 1, ?, ?, ?)
         ON CONFLICT(month) DO UPDATE SET
           cost_hkd = cost_hkd + excluded.cost_hkd,
           analyses = analyses + 1,
           input_tokens = input_tokens + excluded.input_tokens,
           output_tokens = output_tokens + excluded.output_tokens,
           updated_at = excluded.updated_at`,
      )
      .bind(month, costHKD, inputTokens, outputTokens, new Date().toISOString())
      .run();
  }

  async month(month: string): Promise<SpendSnapshot> {
    await this.ensure();
    const { results } = await this.db
      .prepare(`SELECT cost_hkd, analyses, input_tokens, output_tokens FROM ai_spend WHERE month = ?`)
      .bind(month)
      .all<{ cost_hkd: number; analyses: number; input_tokens: number; output_tokens: number }>();
    const r = results[0];
    return r
      ? { costHKD: r.cost_hkd, analyses: r.analyses, inputTokens: r.input_tokens, outputTokens: r.output_tokens }
      : ZERO;
  }
}

export function createMemorySpendStore(): SpendStore {
  const m = new Map<string, SpendSnapshot>();
  return {
    persistent: false,
    async add(month, costHKD, inputTokens, outputTokens) {
      const cur = m.get(month) ?? { ...ZERO };
      m.set(month, {
        costHKD: cur.costHKD + costHKD,
        analyses: cur.analyses + 1,
        inputTokens: cur.inputTokens + inputTokens,
        outputTokens: cur.outputTokens + outputTokens,
      });
    },
    async month(month) {
      return m.get(month) ?? ZERO;
    },
  };
}

let _store: SpendStore | null = null;
export function getSpendStore(): SpendStore {
  if (_store) return _store;
  try {
    const { env } = getCloudflareContext();
    const db = (env as { VISITS_DB?: D1Like }).VISITS_DB;
    _store = db ? new D1SpendStore(db) : createMemorySpendStore();
  } catch {
    _store = createMemorySpendStore();
  }
  return _store;
}

/** 測試用 */
export function setSpendStore(s: SpendStore | null): void {
  _store = s;
}
