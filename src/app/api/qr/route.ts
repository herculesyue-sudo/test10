import { NextResponse } from 'next/server';
import QRCode from 'qrcode';

export const runtime = 'nodejs';

/**
 * 產生指向**呢個 app 自己**嘅 QR code（SVG）。
 *
 * ⚠️ 刻意唔收「要編碼咩內容」呢個參數。
 *
 * 一個收咩就編碼咩嘅 QR endpoint，等於免費借咗你個網域俾人做釣魚 QR ——
 * 人哋派街招，個 QR 由 drtimeless.com 出，指去佢個假網站，出事嘅係你。
 * 所以呢度只接受一個**路徑**，網域由請求嘅 Host header 決定，
 * 呼叫方冇辦法指去外部網站。
 *
 * SVG 而唔係 PNG：印海報要放大，SVG 點放大都清。
 */
const SAFE_PATH = /^\/[A-Za-z0-9/_-]*$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get('path') ?? '/';
  if (!SAFE_PATH.test(path)) {
    return NextResponse.json({ error: 'path 只可以係本站路徑' }, { status: 400 });
  }

  // 用 x-forwarded-* 先：喺 Vercel / Railway 後面，req.url 個 host 係內部位址
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  const proto = req.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const target = `${proto}://${host}${path}`;

  const svg = await QRCode.toString(target, {
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
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
