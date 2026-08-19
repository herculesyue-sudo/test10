import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { resolvePublicUrl } from '@/lib/public-url';

export const runtime = 'nodejs';

/**
 * 產生指向**呢個 app 自己**嘅 QR code（SVG）。
 *
 * ⚠️ 刻意唔收「要編碼咩內容」呢個參數。
 *
 * 一個收咩就編碼咩嘅 QR endpoint，等於免費借咗你個網域俾人做釣魚 QR ——
 * 人哋派街招，個 QR 由 drtimeless.com 出，指去佢個假網站，出事嘅係你。
 * 所以呢度只接受一個**路徑**，網域由 resolvePublicUrl 決定，
 * 呼叫方冇辦法指去外部網站。
 *
 * `?info=1` 回 JSON（網址、去唔去得到、可唔可以印），俾 /share 顯示警告。
 * 冇呢個嘅話，一個指住 localhost 嘅 QR 會睇落完全正常。
 */
const SAFE_PATH = /^\/[A-Za-z0-9/_-]*$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get('path') ?? '/';
  if (!SAFE_PATH.test(path)) {
    return NextResponse.json({ error: 'path 只可以係本站路徑' }, { status: 400 });
  }

  const site = resolvePublicUrl(req.headers, url.host);

  if (url.searchParams.get('info') === '1') {
    return NextResponse.json({ ...site, target: site.url ? site.url + path : '' });
  }

  if (!site.url) {
    return NextResponse.json({ error: site.warning ?? '算唔到對外網址' }, { status: 500 });
  }

  const svg = await QRCode.toString(site.url + path, {
    type: 'svg',
    // M 級容錯：印出嚟俾人掂污糟咗、貼紙翹起都仲掃得到，
    // 但又唔會好似 H 級咁令圖案太密、細張時難掃。
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
  });

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // 唔可以快取：同一個 app 可以由 localhost、preview、正式網域開，
      // 快取咗就會出現「明明部署咗但個 QR 仲係舊網址」。
      'Cache-Control': 'no-store',
    },
  });
}
