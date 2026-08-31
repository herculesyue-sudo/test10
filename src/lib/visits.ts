import type { CategoryKey } from './categories';

/**
 * 客人分析紀錄（「商戶後台」嘅資料層）。
 *
 * ── 儲咩、唔儲咩（同 SaveRecordCard 嘅同意文字綁死）──
 * 儲：標準化電話（搜尋 key）、日期、8 大範疇評分、觀察嘅
 *     key/severity/confidence、目標、年齡段。
 * 唔儲：相片、觀察嘅自由文字（observation/location）、任何其他嘢。
 *     文字描述係由相片衍生嘅個人資料 —— 唔儲就唔使管。
 *
 * ── 保留期 ──
 * 24 個月，同意文字寫明。冇 cron：讀取時過濾 + 寫入時懶清除。
 *
 * ── Store seam ──
 * 同 ratelimit.ts / funnel.ts 一樣嘅款：interface + 記憶體實作 +
 * setVisitStore()。唯一分別係 async —— 因為正式版係 Cloudflare D1。
 * D1 嘅接駁喺 visits-d1.ts，用動態 import 載入：@opennextjs/cloudflare
 * 係 ESM-only，test-engine（tsx CJS）同瀏覽器 bundle 都唔可以掂到佢。
 */

export const RETENTION_MONTHS = 24;

/**
 * 香港電話標準化 —— 搜尋同刪除都靠呢個做 key，
 * 所以「+852 9123 4567」同「91234567」一定要係同一個客人。
 * 接受 8 位、852 開頭 11 位、00852 開頭；首位要 2–9（香港號段）。
 */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('852')) d = d.slice(3);
  return /^[2-9]\d{7}$/.test(d) ? d : null;
}

/**
 * 香港手機號碼 —— 客人自助流程用嘅窄版：只收 4/5/6/7/9 字頭。
 * 固網（2/3 字頭）唔係手機，WhatsApp 跟進唔到；求其打 8 位數過骨嘅
 * 假號碼都會俾呢度擋走一批。records 搜尋照用 normalizePhone（職員
 * 可能真係想搵一個舊固網紀錄）。
 */
export function normalizeHKMobile(raw: string): string | null {
  const p = normalizePhone(raw);
  return p && /^[45679]/.test(p) ? p : null;
}

/** 唔包 observation / location —— 邊界上剝走，同 stripInternal 同一個原則。 */
export interface VisitFinding {
  key: string;
  severity: number;
  confidence: number;
}

export interface VisitRecord {
  id: string;
  /** 已標準化嘅 8 位號碼 */
  phone: string;
  /** ISO 8601 UTC */
  createdAt: string;
  source: 'customer' | 'pro';
  ageBand?: string;
  goals: string[];
  categoryScores: { key: CategoryKey; score: number; lowConfidence: boolean }[];
  findings: VisitFinding[];
}

export interface VisitStore {
  /** false = 記憶體，重啟即冇。UI 要照直講。 */
  readonly persistent: boolean;
  save(v: VisitRecord): Promise<void>;
  /** 新到舊，已按保留期過濾 */
  listByPhone(phone: string): Promise<VisitRecord[]>;
  /** 回傳刪除咗幾多筆（PDPO 刪除請求要覆到數） */
  deleteByPhone(phone: string): Promise<number>;
}

export function retentionCutoffISO(now = new Date()): string {
  const d = new Date(now);
  d.setMonth(d.getMonth() - RETENTION_MONTHS);
  return d.toISOString();
}

class MemoryVisitStore implements VisitStore {
  readonly persistent = false;
  private data = new Map<string, VisitRecord[]>();

  async save(v: VisitRecord) {
    const arr = this.data.get(v.phone) ?? [];
    arr.push(v);
    this.data.set(v.phone, arr);
  }

  async listByPhone(phone: string) {
    const cutoff = retentionCutoffISO();
    return (this.data.get(phone) ?? [])
      .filter((v) => v.createdAt >= cutoff)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteByPhone(phone: string) {
    const n = (this.data.get(phone) ?? []).length;
    this.data.delete(phone);
    return n;
  }
}

export function createMemoryVisitStore(): VisitStore {
  return new MemoryVisitStore();
}

let injected: VisitStore | null = null;
/** 測試或者換其他後端用。 */
export function setVisitStore(s: VisitStore) {
  injected = s;
  resolved = s;
}

let resolved: VisitStore | null = null;
// 記憶體 fallback 一定要係全 process 單例：demo 模式「儲存 → 搜尋」
// 兩個 request 要見到同一份資料先測試得到成個流程。
const memorySingleton = createMemoryVisitStore();

/**
 * 攞 store：注入 > D1（有 binding 先有）> 記憶體單例。
 * D1 唔存在唔係錯誤 —— 本機 dev、demo、未起資料庫嘅部署都係呢個狀態，
 * app 唔可以 crash，只可以老老實實話「唔會長期保存」。
 */
export async function getVisitStore(): Promise<VisitStore> {
  if (injected) return injected;
  if (resolved) return resolved;
  let store: VisitStore;
  try {
    const mod = await import('./visits-d1');
    store = mod.tryCreateD1Store() ?? memorySingleton;
  } catch {
    store = memorySingleton;
  }
  resolved = store;
  return store;
}
