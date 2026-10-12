import { getCloudflareContext } from '@opennextjs/cloudflare';
import { retentionCutoffISO, type VisitRecord, type VisitStore } from './visits';

/**
 * Cloudflare D1 版 VisitStore。
 *
 * ── binding 攞法（對住 v1.20.2 嘅 dist 核實過）──
 * getCloudflareContext()（同步版）：喺 worker / cf:preview 入面，worker
 * entrypoint 已經將 context 掛咗喺 globalThis，同步攞一定得。喺純
 * `next dev`（我哋冇裝 initOpenNextCloudflareForDev）佢會即刻 throw，
 * 冇副作用 —— 呢個正正係我哋要嘅判斷訊號：throw = 唔喺 Cloudflare 環境，
 * 用返記憶體。刻意唔用 async 版：嗰條路會靜靜雞拉起 miniflare。
 *
 * ── 點解自己聲明 D1 型別 ──
 * @cloudflare/workers-types 冇裝（唔想為一個 binding 加成套全域型別）。
 * 呢度用最小結構型別，同 D1 實際 runtime API 對齊。
 */
interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface D1Like {
  prepare(sql: string): D1Stmt;
}

/**
 * 同 schema.sql 一致（test-engine 有 drift 測試守住）。喺 isolate 第一次
 * 用嗰陣行一次 —— 咁樣「operator 起咗 DB 但唔記得行 migration」呢個
 * 失敗模式就唔存在。
 */
const DDL = [
  `CREATE TABLE IF NOT EXISTS visits (
    id              TEXT PRIMARY KEY,
    phone           TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    source          TEXT NOT NULL CHECK (source IN ('customer','pro')),
    age_band        TEXT,
    goals           TEXT NOT NULL DEFAULT '[]',
    category_scores TEXT NOT NULL,
    findings        TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_visits_phone ON visits (phone, created_at DESC)`,
];

interface VisitRow {
  id: string;
  phone: string;
  created_at: string;
  source: string;
  age_band: string | null;
  goals: string;
  category_scores: string;
  findings: string;
}

class D1VisitStore implements VisitStore {
  readonly persistent = true;
  private ready: Promise<void> | null = null;

  constructor(private db: D1Like) {}

  private ensure(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        for (const sql of DDL) await this.db.prepare(sql).run();
      })();
    }
    return this.ready;
  }

  async save(v: VisitRecord): Promise<void> {
    await this.ensure();
    await this.db
      .prepare(
        `INSERT INTO visits (id, phone, created_at, source, age_band, goals, category_scores, findings)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        v.id,
        v.phone,
        v.createdAt,
        v.source,
        v.ageBand ?? null,
        JSON.stringify(v.goals),
        JSON.stringify(v.categoryScores),
        JSON.stringify(v.findings),
      )
      .run();
    // 懶清除：寫入時順手掃走過咗保留期嘅嘢（ISO UTC 字串比較係啱嘅）
    await this.db.prepare(`DELETE FROM visits WHERE created_at < ?`).bind(retentionCutoffISO()).run();
  }

  async listByPhone(phone: string): Promise<VisitRecord[]> {
    await this.ensure();
    const { results } = await this.db
      .prepare(`SELECT * FROM visits WHERE phone = ? AND created_at >= ? ORDER BY created_at DESC`)
      .bind(phone, retentionCutoffISO())
      .all<VisitRow>();
    return results.map((r) => ({
      id: r.id,
      phone: r.phone,
      createdAt: r.created_at,
      source: r.source === 'pro' ? 'pro' : 'customer',
      ageBand: r.age_band ?? undefined,
      goals: JSON.parse(r.goals),
      categoryScores: JSON.parse(r.category_scores),
      findings: JSON.parse(r.findings),
    }));
  }

  async deleteByPhone(phone: string): Promise<number> {
    await this.ensure();
    const res = await this.db.prepare(`DELETE FROM visits WHERE phone = ?`).bind(phone).run();
    return res.meta.changes;
  }
}

/**
 * 有 D1 binding 就回個 store，冇就 null（本機 dev / demo / 未起 DB）。
 * null 唔係錯誤 —— 上層會用記憶體 + 喺 UI 老實講唔會長期保存。
 */
export function tryCreateD1Store(): VisitStore | null {
  try {
    const { env } = getCloudflareContext();
    const db = (env as { VISITS_DB?: D1Like }).VISITS_DB;
    return db ? new D1VisitStore(db) : null;
  } catch {
    return null;
  }
}
