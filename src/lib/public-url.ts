/**
 * 個 app 對外嘅真實網址。
 *
 * ── 點解要專登做呢件事 ──
 *
 * QR code 最容易出錯嘅地方唔係產生失敗，而係**產生咗一個掃到但去唔到嘅
 * 網址**。個 QR 睇落完全正常、掃得到、格式啱晒，但手機開唔到 —— 而你
 * 可能已經印咗一百張海報出嚟。
 *
 * 兩個實際會中招嘅情況：
 *
 *   1. 喺本機行 `npm run dev` 開 /share → Host 係 `localhost:3000`。
 *      個 QR 編碼咗 `http://localhost:3000/`。用手機掃 → 手機去搵
 *      **佢自己**部機嘅 localhost → 乜都冇。
 *
 *   2. 喺 Vercel **preview** 網址開 /share → Host 係
 *      `project-a1b2c3-team.vercel.app`，下次部署就會變。印咗嘅海報
 *      即刻變死連結。
 *
 * 所以：有 NEXT_PUBLIC_SITE_URL 就用佢（嗰個係診所自己指定嘅固定網址），
 * 冇先至用 Host header，而且一定要話俾人知個網址係咪真係去得到。
 */

export type Reachability =
  /** 公開網址，手機掃到就去到 */
  | 'public'
  /** 區域網（同一個 Wi-Fi 先去到）—— 測試得，唔可以印 */
  | 'lan'
  /** 只有伺服器自己去到 —— 掃咗等於冇 */
  | 'local';

export interface PublicUrl {
  /** QR 會編碼嘅完整網址 */
  url: string;
  /** 由邊度嚟：診所設定 定 猜返嚟 */
  source: 'env' | 'host';
  reachability: Reachability;
  /** 可唔可以印海報 */
  printable: boolean;
  /** 唔得嘅原因 + 點解決，直接顯示俾人睇 */
  warning?: string;
}

const LOCAL_HOSTS = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0)$/i;
const LAN_HOSTS = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/;

export function classifyHost(hostname: string): Reachability {
  if (LOCAL_HOSTS.test(hostname)) return 'local';
  if (LAN_HOSTS.test(hostname)) return 'lan';
  return 'public';
}

/**
 * 由 request headers（或者環境變數）算出對外網址。
 *
 * 喺 Vercel / Railway 呢類 proxy 後面，`req.url` 個 host 係內部位址，
 * 所以要睇 `x-forwarded-host` 先。
 */
export function resolvePublicUrl(headers: Headers, fallbackHost: string): PublicUrl {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');

  if (configured) {
    try {
      const u = new URL(configured);
      const reach = classifyHost(u.hostname);
      return {
        url: u.origin,
        source: 'env',
        reachability: reach,
        printable: reach === 'public',
        warning:
          reach === 'public'
            ? undefined
            : `NEXT_PUBLIC_SITE_URL 設咗做 ${u.origin}，但呢個唔係一個公開網址，手機掃咗都去唔到。`,
      };
    } catch {
      // 設錯格式（例如漏咗 https://）唔應該靜靜雞當冇設 —— 要講出嚟
      return {
        url: '',
        source: 'env',
        reachability: 'local',
        printable: false,
        warning: `NEXT_PUBLIC_SITE_URL 嘅格式唔啱（「${configured}」）。要連 https:// 一齊寫，例如 https://your-app.vercel.app。`,
      };
    }
  }

  const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? fallbackHost;
  const hostname = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  const reach = classifyHost(hostname);
  const proto = headers.get('x-forwarded-proto') ?? (reach === 'public' ? 'https' : 'http');

  return {
    url: `${proto}://${host}`,
    source: 'host',
    reachability: reach,
    printable: reach === 'public',
    warning:
      reach === 'local'
        ? '你而家喺本機行緊（localhost）。個 QR 會編碼 localhost —— 用手機掃嘅話，手機會去搵佢自己部機，一定開唔到。要放上網之後先印海報。'
        : reach === 'lan'
          ? '你而家用緊區域網位址。同一個 Wi-Fi 嘅手機掃得到，可以用嚟測試，但唔好印海報 —— 出咗診所個 Wi-Fi 就冇用。'
          : '未設定 NEXT_PUBLIC_SITE_URL，個網址係由呢次請求猜返嚟。如果你而家開緊嘅係 Vercel preview 網址，下次部署就會變，印咗嘅海報會變死連結。',
  };
}
