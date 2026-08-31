import { createHmac } from 'node:crypto';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Like } from './visits-d1';

/**
 * 每個電話嘅免費分析額度。
 *
 * 商業目的：每次分析真金白銀（Vertex AI），冇上限就會俾人玩爛；
 * 3 次夠客人試勻自己最關心嘅角度，之後嘅出路係 WhatsApp 預約面診。
 *
 * 私隱設計：**唔儲原始電話號碼**。用 HMAC-SHA256（key 係伺服器 secret
 * FUNNEL_TOKEN）先至入 D1 —— 冇個 secret 就還原唔到，quota 照計得。
 * 呢個同 visits 表唔同：visits 係客人明示同意先儲（要俾佢查返），
 * quota 只係計數，冇必要見到真號碼。
 *
 * 同 ratelimit.ts（全站每日總額）係兩層唔同嘅保護，唔好合併。
 */

export { FREE_ANALYSES_PER_PHONE } from './quota-config';

export interface QuotaStore {
  /** false = 記憶體（本機 dev），重啟就重置 */
  persistent: boolean;
  used(key: string): Promise<number>;
  /** 用咗一次；回傳新嘅已用次數 */
  increment(key: string): Promise<number>;
}

/** 電話 → 不可還原嘅 key。冇 pepper（本機 dev）用固定字串，反正嗰陣係記憶體 store。 */
export function phoneKey(normalizedPhone: string): string {
  const pepper = process.env.FUNNEL_TOKEN || 'dev-pepper-not-secret';
  return createHmac('sha256', pepper).update(normalizedPhone).digest('hex');
}

const DDL = `CREATE TABLE IF NOT EXISTS phone_quota (
  phone_key  TEXT PRIMARY KEY,
  used       INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
)`;

class D1QuotaStore implements QuotaStore {
  readonly persistent = true;
  private ready: Promise<void> | null = null;

  constructor(private db: D1Like) {}

  private ensure(): Promise<void> {
    if (!this.ready) this.ready = this.db.prepare(DDL).run().then(() => undefined);
    return this.ready;
  }

  async used(key: string): Promise<number> {
    await this.ensure();
    const { results } = await this.db
      .prepare(`SELECT used FROM phone_quota WHERE phone_key = ?`)
      .bind(key)
      .all<{ used: number }>();
    return results[0]?.used ?? 0;
  }

  async increment(key: string): Promise<number> {
    await this.ensure();
    const { results } = await this.db
      .prepare(
        `INSERT INTO phone_quota (phone_key, used, updated_at) VALUES (?, 1, ?)
         ON CONFLICT(phone_key) DO UPDATE SET used = used + 1, updated_at = excluded.updated_at
         RETURNING used`,
      )
      .bind(key, new Date().toISOString())
      .all<{ used: number }>();
    return results[0]?.used ?? 1;
  }
}

export function createMemoryQuotaStore(): QuotaStore {
  const m = new Map<string, number>();
  return {
    persistent: false,
    async used(key) {
      return m.get(key) ?? 0;
    },
    async increment(key) {
      const n = (m.get(key) ?? 0) + 1;
      m.set(key, n);
      return n;
    },
  };
}

let _store: QuotaStore | null = null;
export function getQuotaStore(): QuotaStore {
  if (_store) return _store;
  try {
    const { env } = getCloudflareContext();
    const db = (env as { VISITS_DB?: D1Like }).VISITS_DB;
    _store = db ? new D1QuotaStore(db) : createMemoryQuotaStore();
  } catch {
    _store = createMemoryQuotaStore();
  }
  return _store;
}

/** 測試用 */
export function setQuotaStore(s: QuotaStore | null): void {
  _store = s;
}
