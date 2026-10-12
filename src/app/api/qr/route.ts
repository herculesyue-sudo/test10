import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { resolvePublicUrl } from '@/lib/public-url';
import { lanUrl } from '@/lib/lan-address';

export const runtime = 'nodejs';

/**
 * 產生指向**呢個 app 自己**嘅 QR code（SVG）。
 *
 * ⚠️ 刻意唔收「要編碼咩內容」呢個參數。
 *
 * 一個收咩就編碼咩嘅 QR endpoint，等於免費借咗你個網域俾人做釣魚 QR ——
 * 人哋派街招，個 QR 由 drtimeless.com 出，指去佢個假網站，出事嘅係你。
 * 所以呢度只接受一個**路徑**同一個 `target` 列舉值，網域一律由伺服器決定，
 * 呼叫方冇辦法指去外部網站。
 *
 * target=site（預設）── 對外網址，印海報用
 * target=lan          ── 區域網位址，喺本機開發時用手機試用
 * info=1              ── 回 JSON（網址、去唔去得到、可唔可以印）
 */
const SAFE_PATH = /^\/[A-Za-z0-9/_-]*$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get('path') ?? '/';
  if (!SAFE_PATH.test(path)) {
    return NextResponse.json({ error: 'path 只可以係本站路徑' }, { status: 400 });
  }

  const site = resolvePublicUrl(req.headers, url.host);

  // 由 Host 攞返個 port，令區域網位址帶返正確嘅 :3000
  const hostHeader = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  const port = /:(\d+)$/.exec(hostHeader)?.[1] ?? '';
  const lan = site.reachability === 'local' ? lanUrl(port) : null;

  if (url.searchParams.get('info') === '1') {
    return NextResponse.json({
      ...site,
      target: site.url ? site.url + path : '',
      // 只喺本機情況先俾區域網位址 —— 部署咗就唔應該再引導人用內部 IP
      lanUrl: lan,
      lanTarget: lan ? lan + path : null,
    });
  }

  const wantLan = url.searchParams.get('target') === 'lan';
  const base = wantLan ? lan : site.url;

  if (!base) {
    return NextResponse.json(
      { error: wantLan ? '搵唔到區域網位址' : (site.warning ?? '算唔到對外網址') },
      { status: wantLan ? 404 : 500 },
    );
  }

  const svg = await QRCode.toString(base + path, {
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
