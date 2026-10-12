import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Like } from './visits-d1';

/**
 * 暫存報告 —— 自願留資流程嘅橋。
 *
 * 2026-10 流程改版：基本分析唔使留電話。分析完成之後，客人喺結果頁
 * 可以**自願**留電話保存報告／俾診所跟進。問題係：分析嗰刻冇電話，
 * 留電話嗰刻分析已經完成咗 —— 兩件事之間要有個暫存。
 *
 * 點解係 server 暫存而唔係由前端將成份結果 POST 返上嚟：
 * 前端 POST 返嚟嘅嘢可以偽造 —— 開個公開寫入口俾人自報「我有咩皮膚
 * 問題」，等於俾人塞假 lead 落你個跟進名單（可以參考 /api/records
 * 刻意冇 POST 嘅註解）。所以分析成功嗰陣 server 自己將**冇個人資料**
 * 嘅結果摘要（分數、目標、UTM）寫落呢個表，派一個唔可估嘅 UUID 俾
 * 前端；客人留電話嗰陣憑呢個 UUID 認返份結果，server 先將電話
 * attach 落去，寫正式嘅 visit＋lead，然後即刻刪咗暫存行。
 *
 * 私隱：payload 冇電話、冇名、冇相片、冇自由文字 —— 未 attach 電話
 * 之前唔算個人資料。24 個鐘懶清除（讀寫嗰陣順手刪舊行）。
 */

export interface PendingReportPayload {
  createdAt: string;
  goals: string[];
  ageBand?: string;
  /** 同 visits 表一樣：只係 key/severity/confidence，冇文字描述 */
  findings: { key: string; severity: number; confidence: number }[];
  categoryScores: { key: string; score: number; lowConfidence: boolean }[];
  /** 嚴重度最高頭 3 項（俾 lead 用，同 saveLead 原本嘅計法一致） */
  topFindings: { key: string; severity: number }[];
  utm?: string;
}

export interface PendingReportStore {
  readonly persistent: boolean;
  put(id: string, payload: PendingReportPayload): Promise<void>;
  /** 攞兼刪（一次性）。冇／過期 → null。 */
  take(id: string): Promise<PendingReportPayload | null>;
}

/** 暫存有效期：24 個鐘。客人唔會隔夜先諗起要保存。 */
const TTL_MS = 24 * 60 * 60 * 1000;

const DDL = `CREATE TABLE IF NOT EXISTS pending_reports (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  payload     TEXT NOT NULL
)`;

class D1PendingStore implements PendingReportStore {
  readonly persistent = true;
  private ready: Promise<void> | null = null;

  constructor(private db: D1Like) {}

  private ensure(): Promise<void> {
    if (!this.ready) this.ready = this.db.prepare(DDL).run().then(() => undefined);
    return this.ready;
  }

  async put(id: string, payload: PendingReportPayload): Promise<void> {
    await this.ensure();
    await this.sweep();
    await this.db
      .prepare(`INSERT OR REPLACE INTO pending_reports (id, created_at, payload) VALUES (?, ?, ?)`)
      .bind(id, payload.createdAt, JSON.stringify(payload))
      .run();
  }

  async take(id: string): Promise<PendingReportPayload | null> {
    await this.ensure();
    // DELETE ... RETURNING 係單一 statement：兩個請求同時 take 同一 id，
    // 只有一個攞到 payload —— 唔會寫出兩條重複 lead。
    const { results } = await this.db
      .prepare(`DELETE FROM pending_reports WHERE id = ? RETURNING payload`)
      .bind(id)
      .all<{ payload: string }>();
    if (!results.length) return null;
    try {
      return JSON.parse(results[0].payload) as PendingReportPayload;
    } catch {
      return null;
    }
  }

  private async sweep(): Promise<void> {
    const cutoff = new Date(Date.now() - TTL_MS).toISOString();
    await this.db.prepare(`DELETE FROM pending_reports WHERE created_at < ?`).bind(cutoff).run();
  }
}

class MemoryPendingStore implements PendingReportStore {
  readonly persistent = false;

  // globalThis 單例：`next dev` 每個 route 有獨立 module graph，
  // 普通 module-level Map 會令「consult 寫、save-report 讀」
  // 喺本地 dev 搵唔返（production 係單一 bundle＋D1，冇呢個問題）。
  private get data(): Map<string, PendingReportPayload> {
    const g = globalThis as { __drtPending?: Map<string, PendingReportPayload> };
    if (!g.__drtPending) g.__drtPending = new Map();
    return g.__drtPending;
  }

  async put(id: string, payload: PendingReportPayload) {
    if (this.data.size > 1000) this.data.clear();
    this.data.set(id, payload);
  }

  async take(id: string) {
    const p = this.data.get(id) ?? null;
    this.data.delete(id);
    if (p && Date.now() - new Date(p.createdAt).getTime() > TTL_MS) return null;
    return p;
  }
}

let _store: PendingReportStore | null = null;

export function getPendingStore(): PendingReportStore {
  if (_store) return _store;
  try {
    const { env } = getCloudflareContext();
    const db = (env as { VISITS_DB?: D1Like }).VISITS_DB;
    _store = db ? new D1PendingStore(db) : new MemoryPendingStore();
  } catch {
    _store = new MemoryPendingStore();
  }
  return _store;
}

/** 測試用 */
export function setPendingStore(s: PendingReportStore | null): void {
  _store = s;
}
