import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Like } from './visits-d1';

/**
 * 跟進名單 —— 拉新客漏斗嘅落點。
 *
 * 客人喺 ContactCard 剔咗「同意保存＋WhatsApp 跟進」先可以分析，所以
 * 每個完成分析嘅客人都會自動入呢張表，唔使等佢自己撳「傳送報告」。
 * 有撳嘅係熱 lead（診所 WhatsApp 直接收到佢個真號碼），冇撳嘅留喺度
 * 等職員回電 —— 狀態欄就係俾職員記低跟進去到邊。
 *
 * 同 visits 表嘅分工：visits 儲評分（俾下次對比），leads 儲「呢個人
 * 要跟進」同進度。PDPO 刪除請求兩張表一齊刪（records API 負責）。
 *
 * 儲原文電話係因為攞咗明示同意（consent 文字寫明用途＋保留期＋刪除
 * 渠道）—— 同 phone_quota 唔同，嗰邊冇同意所以只儲 HMAC。
 */

import { LEAD_STATUSES, type LeadStatus, type LeadRecord } from './leads-shared';

export { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus, type LeadRecord } from './leads-shared';

export interface LeadStore {
  /** false = 記憶體（本機 dev），重啟就冇 */
  readonly persistent: boolean;
  add(lead: LeadRecord): Promise<void>;
  /** 新到舊 */
  listRecent(limit: number): Promise<LeadRecord[]>;
  setStatus(id: string, status: LeadStatus): Promise<boolean>;
  /** PDPO 刪除鏈：同 visits 一齊刪，回傳刪咗幾多筆 */
  deleteByPhone(phone: string): Promise<number>;
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS leads (
  id           TEXT PRIMARY KEY,
  phone        TEXT NOT NULL,
  name         TEXT,
  created_at   TEXT NOT NULL,
  goals        TEXT NOT NULL DEFAULT '[]',
  top_findings TEXT NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'new',
  source       TEXT NOT NULL DEFAULT 'customer'
)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_created ON leads (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads (phone)`,
];

interface LeadRow {
  id: string;
  phone: string;
  name: string | null;
  created_at: string;
  goals: string;
  top_findings: string;
  status: string;
  source: string;
  utm: string | null;
}

function fromRow(r: LeadRow): LeadRecord {
  return {
    id: r.id,
    phone: r.phone,
    name: r.name ?? undefined,
    createdAt: r.created_at,
    goals: safeParse(r.goals, []),
    topFindings: safeParse(r.top_findings, []),
    status: (LEAD_STATUSES as readonly string[]).includes(r.status) ? (r.status as LeadStatus) : 'new',
    source: r.source === 'pro' ? 'pro' : 'customer',
    utm: r.utm ?? undefined,
  };
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

class D1LeadStore implements LeadStore {
  readonly persistent = true;
  private ready: Promise<void> | null = null;

  constructor(private db: D1Like) {}

  private ensure(): Promise<void> {
    if (!this.ready) {
      this.ready = DDL.reduce(
        (p, stmt) => p.then(() => this.db.prepare(stmt).run().then(() => undefined)),
        Promise.resolve(),
      ).then(async () => {
        // 遷移：utm 係後加嘅欄（CREATE IF NOT EXISTS 唔會補欄）。
        // 已存在就會 throw「duplicate column」，吞咗佢就係冪等。
        try {
          await this.db.prepare(`ALTER TABLE leads ADD COLUMN utm TEXT`).run();
        } catch {
          /* 欄已存在 */
        }
      });
    }
    return this.ready;
  }

  async add(lead: LeadRecord): Promise<void> {
    await this.ensure();
    await this.db
      .prepare(
        `INSERT INTO leads (id, phone, name, created_at, goals, top_findings, status, source, utm) VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        lead.id,
        lead.phone,
        lead.name ?? null,
        lead.createdAt,
        JSON.stringify(lead.goals),
        JSON.stringify(lead.topFindings),
        lead.status,
        lead.source,
        lead.utm ?? null,
      )
      .run();
  }

  async listRecent(limit: number): Promise<LeadRecord[]> {
    await this.ensure();
    const { results } = await this.db
      .prepare(`SELECT * FROM leads ORDER BY created_at DESC LIMIT ?`)
      .bind(limit)
      .all<LeadRow>();
    return results.map(fromRow);
  }

  async setStatus(id: string, status: LeadStatus): Promise<boolean> {
    await this.ensure();
    const { results } = await this.db
      .prepare(`UPDATE leads SET status = ? WHERE id = ? RETURNING id`)
      .bind(status, id)
      .all<{ id: string }>();
    return results.length > 0;
  }

  async deleteByPhone(phone: string): Promise<number> {
    await this.ensure();
    const { results } = await this.db
      .prepare(`DELETE FROM leads WHERE phone = ? RETURNING id`)
      .bind(phone)
      .all<{ id: string }>();
    return results.length;
  }
}

export function createMemoryLeadStore(): LeadStore {
  const rows: LeadRecord[] = [];
  return {
    persistent: false,
    async add(lead) {
      rows.push(lead);
    },
    async listRecent(limit) {
      return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    },
    async setStatus(id, status) {
      const r = rows.find((x) => x.id === id);
      if (!r) return false;
      r.status = status;
      return true;
    },
    async deleteByPhone(phone) {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].phone === phone) rows.splice(i, 1);
      return before - rows.length;
    },
  };
}

let _store: LeadStore | null = null;
export function getLeadStore(): LeadStore {
  if (_store) return _store;
  try {
    const { env } = getCloudflareContext();
    const db = (env as { VISITS_DB?: D1Like }).VISITS_DB;
    _store = db ? new D1LeadStore(db) : createMemoryLeadStore();
  } catch {
    _store = createMemoryLeadStore();
  }
  return _store;
}

/** 測試用 */
export function setLeadStore(s: LeadStore | null): void {
  _store = s;
}
