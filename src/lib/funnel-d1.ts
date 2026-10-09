import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Like } from './visits-d1';
import type { FunnelStep, FunnelStore } from './funnel';

/**
 * Cloudflare D1 版 FunnelStore。
 *
 * 點解要由記憶體搬過嚟：記憶體 funnel 喺 Cloudflare Workers 每個
 * isolate 各自計數、重啟清零 —— 你睇到嘅「完成率」其實係「邊個
 * isolate 啱啱好接到啲 request」，冇決策價值。搬落 D1 之後先係
 * 真數字。
 *
 * 私隱不變：照舊只係 (日期, 步驟, 次數) 嘅計數，冇 IP、冇 cookie、
 * 冇任何識別到個人嘅嘢。
 *
 * 寫入係 fire-and-forget 嘅計數，唔係錢銀 —— upsert 撞 key 加一就得，
 * 唔使 transaction。
 */

const DDL = [
  `CREATE TABLE IF NOT EXISTS funnel_daily (
    day    TEXT NOT NULL,
    step   TEXT NOT NULL,
    count  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, step)
  )`,
];

class D1FunnelStore implements FunnelStore {
  private ready: Promise<void> | null = null;

  constructor(private db: D1Like) {}

  private ensure(): Promise<void> {
    if (!this.ready) {
      this.ready = DDL.reduce(
        (p, stmt) => p.then(() => this.db.prepare(stmt).run().then(() => undefined)),
        Promise.resolve(),
      );
    }
    return this.ready;
  }

  async bump(day: string, step: FunnelStep): Promise<void> {
    await this.ensure();
    await this.db
      .prepare(
        `INSERT INTO funnel_daily (day, step, count) VALUES (?, ?, 1)
         ON CONFLICT(day, step) DO UPDATE SET count = count + 1`,
      )
      .bind(day, step)
      .run();
  }

  async snapshot(): Promise<Record<string, Partial<Record<FunnelStep, number>>>> {
    await this.ensure();
    // 同記憶體版一樣只保留 30 日 —— 懶清除，寫唔使 cron
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    await this.db.prepare(`DELETE FROM funnel_daily WHERE day < ?`).bind(cutoff).run();
    const { results } = await this.db
      .prepare(`SELECT day, step, count FROM funnel_daily ORDER BY day DESC`)
      .bind()
      .all<{ day: string; step: string; count: number }>();
    const out: Record<string, Partial<Record<FunnelStep, number>>> = {};
    for (const r of results) {
      (out[r.day] ??= {})[r.step as FunnelStep] = r.count;
    }
    return out;
  }
}

/** 有 VISITS_DB binding 就回 D1 版，冇就 null（呼叫方落記憶體）。 */
export function tryCreateD1Funnel(): FunnelStore | null {
  try {
    const { env } = getCloudflareContext();
    const db = (env as { VISITS_DB?: D1Like }).VISITS_DB;
    return db ? new D1FunnelStore(db) : null;
  } catch {
    return null;
  }
}
