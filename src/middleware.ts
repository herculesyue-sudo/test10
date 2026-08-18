import { NextResponse, type NextRequest } from 'next/server';
import { frameAncestors } from '@/lib/embed-config';

/**
 * frame-ancestors 喺呢度設，唔喺 next.config 度設。
 *
 * 分別好重要：`next.config` 嘅 headers() 喺 **build** 嗰陣evaluate，個值會
 * 烘死喺 routes-manifest 入面。即係診所喺 Vercel 加咗 EMBED_ALLOWED_ORIGINS
 * 但冇重新部署 → 環境變數睇落設咗、`/api/embed-status` 都話設咗、但個
 * widget 就係死都唔出。呢種「睇落啱但實際冇生效」嘅情況最難 debug。
 *
 * middleware 每次請求先 evaluate，所以改完環境變數即刻生效，亦保證
 * 同 `/api/embed-status` 睇到嘅係同一份設定。
 */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const isEmbed = req.nextUrl.pathname === '/embed';
  res.headers.set(
    'Content-Security-Policy',
    `frame-ancestors ${isEmbed ? frameAncestors() : "'self'"};`,
  );
  return res;
}

export const config = {
  // 靜態資源唔使行 —— 佢哋唔會俾人 iframe，行咗只係白白加延遲。
  matcher: ['/((?!_next/static|_next/image|favicon.ico|embed.js).*)'],
};
