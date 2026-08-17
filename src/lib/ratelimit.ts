/**
 * 速率限制 + 每日總量上限。
 *
 * 呢個係上線前唯一真正「唔做就會出事」嘅嘢：`/api/consult` 一個公開
 * endpoint，每次呼叫都燒你嘅 Anthropic 額度。一個 for-loop 就可以整晚
 * 幫你花幾千蚊，而你朝早起身先知。
 *
 * 兩層防護，因為佢哋擋唔同嘅嘢：
 *   1. 每個 IP 嘅速率限制 —— 擋單一來源嘅濫用
 *   2. 全站每日總量上限 —— 擋分散式濫用同你自己個 bug。呢層先係
 *      「最壞情況會蝕幾多」嘅硬保證
 *
 * ⚠️ 記憶體實作嘅限制：serverless（Vercel）每個 instance 有自己嘅記憶體，
 *    scale out 之後實際上限會係「你設嘅數 × instance 數量」。單一 instance
 *    嘅部署（Railway / Fly.io / 自建）就準確。要跨 instance 準確就要用
 *    Redis —— 見下面 RateLimitStore 介面，換實作唔使改呼叫方。
 */

export interface RateLimitResult {
  ok: boolean;
  /** 唔 ok 時，幾多秒之後可以再試 */
  retryAfterSec?: number;
  /** 俾人睇嘅原因 */
  reason?: string;
  remaining?: number;
}

export interface RateLimitConfig {
  /** 每個 IP 喺 windowSec 內最多幾多次 */
  perIp: number;
  windowSec: number;
  /** 全站每日上限（UTC 日曆日） */
  dailyTotal: number;
}

export const DEFAULT_LIMITS: RateLimitConfig = {
  perIp: Number(process.env.RATE_LIMIT_PER_IP ?? 5),
  windowSec: Number(process.env.RATE_LIMIT_WINDOW_SEC ?? 3600),
  dailyTotal: Number(process.env.RATE_LIMIT_DAILY_TOTAL ?? 500),
};

/** 換 Redis 只需要另做一個實作，呼叫方唔使改。 */
export interface RateLimitStore {
  hits(key: string, windowSec: number): number;
  record(key: string): void;
  dailyCount(): number;
  recordDaily(): void;
}

class MemoryStore implements RateLimitStore {
  private ipHits = new Map<string, number[]>();
  private daily = new Map<string, number>();
  private lastSweep = 0;

  hits(key: string, windowSec: number): number {
    this.sweep(windowSec);
    const now = Date.now();
    const cutoff = now - windowSec * 1000;
    const arr = (this.ipHits.get(key) ?? []).filter((t) => t > cutoff);
    if (arr.length) this.ipHits.set(key, arr);
    else this.ipHits.delete(key);
    return arr.length;
  }

  record(key: string): void {
    const arr = this.ipHits.get(key) ?? [];
    arr.push(Date.now());
    this.ipHits.set(key, arr);
  }

  dailyCount(): number {
    return this.daily.get(todayKey()) ?? 0;
  }

  recordDaily(): void {
    const k = todayKey();
    this.daily.set(k, (this.daily.get(k) ?? 0) + 1);
    // 只保留今日同昨日，避免 map 無限增長
    for (const key of this.daily.keys()) {
      if (key !== k && key !== yesterdayKey()) this.daily.delete(key);
    }
  }

  /** 定期清走過期 IP 記錄，否則長開嘅 server 會慢慢食記憶體。 */
  private sweep(windowSec: number) {
    const now = Date.now();
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    const cutoff = now - windowSec * 1000;
    for (const [k, arr] of this.ipHits) {
      const kept = arr.filter((t) => t > cutoff);
      if (kept.length) this.ipHits.set(k, kept);
      else this.ipHits.delete(k);
    }
  }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayKey() {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

let store: RateLimitStore = new MemoryStore();

/** 測試或者換 Redis 用。 */
export function setRateLimitStore(s: RateLimitStore) {
  store = s;
}

/**
 * 開一個乾淨嘅記憶體 store。測試用呢個先至係測緊真正嘅實作，
 * 而唔係測試檔入面另寫一份「應該一樣」嘅假貨。
 */
export function createMemoryStore(): RateLimitStore {
  return new MemoryStore();
}

/**
 * 由 request headers 抽 client IP。
 *
 * `x-forwarded-for` 可以被偽造，但喺 Vercel / Cloudflare 呢類 proxy 後面，
 * 佢哋會覆寫最左邊嗰個值，所以取第一個係啱嘅。自建 nginx 要確認有
 * `proxy_set_header X-Real-IP`。攞唔到就 fallback 去一個共用 key ——
 * 寧願所有匿名流量共用一個額度，都好過完全冇限制。
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function checkRateLimit(req: Request, cfg: RateLimitConfig = DEFAULT_LIMITS): RateLimitResult {
  // 全站每日上限先查 —— 呢個係「最壞情況會蝕幾多」嘅硬上限
  if (store.dailyCount() >= cfg.dailyTotal) {
    return {
      ok: false,
      retryAfterSec: secondsUntilUtcMidnight(),
      reason: '今日嘅免費分析名額已滿，請聽日再試，或者直接 WhatsApp 我哋預約。',
    };
  }

  const ip = clientIp(req);
  const used = store.hits(ip, cfg.windowSec);
  if (used >= cfg.perIp) {
    return {
      ok: false,
      retryAfterSec: cfg.windowSec,
      reason: `你喺短時間內已經分析咗 ${cfg.perIp} 次。想深入啲評估，不如直接預約面診？`,
    };
  }

  return { ok: true, remaining: cfg.perIp - used - 1 };
}

/** 只喺真正花錢嗰刻先記數 —— 驗證失敗嘅請求唔應該食客人額度。 */
export function recordUsage(req: Request): void {
  store.record(clientIp(req));
  store.recordDaily();
}

export function usageSnapshot(cfg: RateLimitConfig = DEFAULT_LIMITS) {
  return { today: store.dailyCount(), dailyLimit: cfg.dailyTotal };
}

function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.ceil((midnight - now.getTime()) / 1000);
}
