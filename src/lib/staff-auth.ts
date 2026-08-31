/**
 * 職員頁面保護（`/pro`、`/share`、`/embed/setup`）。
 *
 * 呢個工具一部署上網，所有路徑都係公開嘅。客人版（`/`）公開係應該嘅，
 * 但另外三版唔係：
 *
 *   /pro          睇到全部療程詳情、分階段方案、每次分析嘅實際成本
 *   /share        印海報、診所文案
 *   /embed/setup  嵌入設定同允許清單
 *
 * 冇保護嘅話，任何人估到 `/pro` 就入到 —— 而 `/pro` 每撳一次都係你俾錢。
 *
 * 刻意用最簡單嘅共享密碼，唔做帳戶系統：診所得幾個同事，加一個登入
 * 系統嘅維護成本（改密碼、重設、鎖帳戶）遠高於佢解決嘅問題。撳一次
 * 連結之後種 cookie，之後唔使再輸。
 *
 * ⚠️ 由加入客人紀錄（/records）嗰日起，呢個 token 亦都係保護個人資料
 *    （電話號碼＋皮膚評分）嘅唯一屏障，唔再只係擋 API 額度。
 *    STAFF_TOKEN 一定要夠長夠隨機；懷疑洩露就要即刻換。
 */

export const STAFF_COOKIE = 'drt_staff';

/** 要密碼先入得嘅路徑。 */
export const STAFF_PATHS = ['/pro', '/share', '/embed/setup', '/records', '/api/records', '/api/leads'];

export function isStaffPath(pathname: string): boolean {
  return STAFF_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export function staffToken(): string | undefined {
  const t = process.env.STAFF_TOKEN?.trim();
  return t ? t : undefined;
}

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === '1' || process.env.DEMO_MODE === 'true';
}

export type StaffVerdict =
  | { action: 'allow' }
  | { action: 'set-cookie'; token: string }
  | { action: 'deny'; reason: 'no-token-configured' | 'bad-key' };

/**
 * 決定一個職員頁面請求應該點處理。
 *
 * 未設 STAFF_TOKEN 嘅時候：測試模式放行（方便試），正式環境拒絕。
 * 呢個同 FUNNEL_TOKEN 嘅做法一致 —— 唔可以出現「以為有保護但其實冇」。
 */
export function checkStaff(providedKey: string | null, cookieValue: string | undefined): StaffVerdict {
  const token = staffToken();

  if (!token) {
    return isDemoMode() ? { action: 'allow' } : { action: 'deny', reason: 'no-token-configured' };
  }
  if (cookieValue === token) return { action: 'allow' };
  if (providedKey === token) return { action: 'set-cookie', token };
  return { action: 'deny', reason: 'bad-key' };
}
