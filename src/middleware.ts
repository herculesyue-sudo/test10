import { NextResponse, type NextRequest } from 'next/server';
import { frameAncestors } from '@/lib/embed-config';
import { STAFF_COOKIE, checkStaff, isStaffPath } from '@/lib/staff-auth';

/**
 * 兩件事：嵌入權限（CSP）同職員頁面保護。
 *
 * frame-ancestors 喺呢度設，唔喺 next.config 度設。分別好重要：
 * `next.config` 嘅 headers() 喺 **build** 嗰陣 evaluate，個值會烘死喺
 * routes-manifest 入面。即係診所喺 Vercel 加咗 EMBED_ALLOWED_ORIGINS
 * 但冇重新部署 → 環境變數睇落設咗、`/api/embed-status` 都話設咗、但個
 * widget 就係死都唔出。呢種「睇落啱但實際冇生效」最難 debug。
 *
 * middleware 每次請求先 evaluate，所以改完環境變數即刻生效。
 */
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  if (isStaffPath(pathname)) {
    const verdict = checkStaff(searchParams.get('k'), req.cookies.get(STAFF_COOKIE)?.value);

    if (verdict.action === 'deny') {
      return new NextResponse(denyPage(verdict.reason), {
        status: verdict.reason === 'no-token-configured' ? 403 : 401,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (verdict.action === 'set-cookie') {
      // 種完 cookie 就將 ?k= 由網址剝走 —— 否則個密碼會留喺瀏覽器
      // 歷史、書籤同分享出去嘅連結入面。
      const clean = req.nextUrl.clone();
      clean.searchParams.delete('k');
      const res = NextResponse.redirect(clean);
      res.cookies.set(STAFF_COOKIE, verdict.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.nextUrl.protocol === 'https:',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
      return res;
    }
  }

  const res = NextResponse.next();
  res.headers.set(
    'Content-Security-Policy',
    `frame-ancestors ${pathname === '/embed' ? frameAncestors() : "'self'"};`,
  );
  return res;
}

function denyPage(reason: 'no-token-configured' | 'bad-key'): string {
  const body =
    reason === 'no-token-configured'
      ? `<h1>未設定 STAFF_TOKEN</h1>
         <p>呢版係診所內部用嘅，未設密碼之前唔會開放。</p>
         <p>喺部署平台嘅環境變數加一個長隨機字串：</p>
         <pre>STAFF_TOKEN=你自己諗一個長密碼</pre>
         <p>之後用 <code>?k=你個密碼</code> 開一次，之後 30 日唔使再輸。</p>`
      : `<h1>密碼唔啱</h1>
         <p>呢版係診所內部用嘅。請用完整連結開啟：</p>
         <pre>https://…/pro?k=你個密碼</pre>`;

  return `<!doctype html><html lang="zh-HK"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>需要授權</title>
<style>
 body{font-family:-apple-system,'PingFang HK','Noto Sans HK',sans-serif;background:#fbfaf8;color:#1c1a17;
      display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;padding:24px;line-height:1.7}
 main{max-width:440px}
 h1{font-size:1.2rem;margin:0 0 12px}
 p{font-size:0.9rem;color:#6b6459;margin:0 0 10px}
 pre{background:#f4f2ee;border:1px solid #e3ded6;border-radius:8px;padding:10px 12px;
     font-size:0.82rem;overflow-x:auto}
 @media(prefers-color-scheme:dark){body{background:#16150f;color:#f0ece4}p{color:#a49b8c}
   pre{background:#2a2721;border-color:#3a352c}}
</style></head><body><main>${body}</main></body></html>`;
}

export const config = {
  // 靜態資源唔使行 —— 佢哋唔會俾人 iframe，行咗只係白白加延遲。
  matcher: ['/((?!_next/static|_next/image|favicon.ico|embed.js).*)'],
};
