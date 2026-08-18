/**
 * 嵌入設定 —— 邊啲網站可以載入呢個工具。
 *
 * ⚠️ 呢個係**成本安全設定**，唔係普通設定。
 *
 * 如果容許任何網站嵌入（frame-ancestors *），競爭對手可以將你個工具擺
 * 上佢哋個網站，用你嘅 API 額度做佢哋嘅生意。你唯一嘅線索係月尾張帳單。
 * 所以預設係「只准自己個網域」，要加就明明白白喺 .env 加。
 *
 * 設 EMBED_ALLOWED_ORIGINS（逗號分隔）：
 *   EMBED_ALLOWED_ORIGINS=https://www.drtimeless.com,https://drtimeless.com
 *
 * 冇設嘅話，`/embed` 只准同源載入（即係得自己個 app），咁樣一個設定
 * 錯誤唔會靜靜雞變成「全世界都用得」。
 */

/** 由 env 讀出允許嵌入嘅網域。 */
export function allowedOrigins(): string[] {
  return (process.env.EMBED_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * CSP frame-ancestors 值。
 *
 * 用 CSP 而唔係 X-Frame-Options，因為 X-Frame-Options 嘅 ALLOW-FROM
 * 喺現代瀏覽器已經冇支援，只有 DENY / SAMEORIGIN 兩個選擇 —— 唔夠用。
 */
export function frameAncestors(): string {
  const list = allowedOrigins();
  return list.length ? `'self' ${list.join(' ')}` : "'self'";
}

/**
 * 檢查一個 origin 可唔可以嵌入。
 * 冇設定嘅時候一律拒絕（fail closed）—— 安全設定唔應該喺未設定時放行。
 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return allowedOrigins().includes(origin.replace(/\/+$/, ''));
}
