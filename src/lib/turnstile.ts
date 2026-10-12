/**
 * Cloudflare Turnstile 伺服器端驗證（免費嘅機械人閘）。
 *
 * 度值：OTP 驗證碼要錢（harris 唔要），咁至少要免費咁擋走 script 亂搞 ——
 * Turnstile 對正常客人隱形，對機械人先出挑戰。
 *
 * 未設定 TURNSTILE_SECRET_KEY = 成個功能熄咗（本機 dev / demo / 測試
 * 照行）。前端同一原則：冇 NEXT_PUBLIC_TURNSTILE_SITE_KEY 就唔 render。
 */

export function turnstileEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

export async function verifyTurnstile(
  token: string | undefined,
  remoteIp: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!turnstileEnabled()) return { ok: true };
  if (!token) return { ok: false, reason: '安全驗證未完成，請重新整理頁面再試一次。' };

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: remoteIp }),
    });
    const j = (await res.json()) as { success?: boolean };
    if (j.success) return { ok: true };
    return { ok: false, reason: '安全驗證失敗，請重新整理頁面再試一次。' };
  } catch {
    // Turnstile 自己壞咗唔應該令成個工具停擺 —— 呢層係加固，唔係命脈
    return { ok: true };
  }
}
