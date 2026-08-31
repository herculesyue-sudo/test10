import { NextResponse } from 'next/server';
import { track, funnelSnapshot, conversionRates, FUNNEL_STEPS, type FunnelStep } from '@/lib/funnel';

export const runtime = 'nodejs';

/**
 * 記一個漏斗事件。
 *
 * 只接受白名單內嘅步驟名，唔收任何其他欄位 —— 呢個 endpoint 係公開嘅，
 * 收咩就存咩等於開咗個免費 log 俾人寫。
 */
export async function POST(req: Request) {
  let step: unknown;
  try {
    ({ step } = await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (typeof step !== 'string' || !FUNNEL_STEPS.includes(step as FunnelStep)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  track(step as FunnelStep);
  return NextResponse.json({ ok: true });
}

/**
 * 睇漏斗數字。
 *
 * 用 FUNNEL_TOKEN 保護：呢啲係營運數字，唔應該公開。冇設 token 就淨係
 * 喺測試模式可以睇 —— 唔會出現「以為有保護但其實冇」嘅情況。
 */
export async function GET(req: Request) {
  const token = process.env.FUNNEL_TOKEN;
  const provided = new URL(req.url).searchParams.get('token');
  const demo = process.env.DEMO_MODE === '1' || process.env.DEMO_MODE === 'true';

  if (token) {
    if (provided !== token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  } else if (!demo) {
    return NextResponse.json(
      { error: '未設定 FUNNEL_TOKEN。喺 .env 加一個隨機字串先可以喺正式環境睇數字。' },
      { status: 403 },
    );
  }

  const snap = funnelSnapshot();
  const days = Object.keys(snap);
  const total: Partial<Record<FunnelStep, number>> = {};
  for (const d of days) {
    for (const [k, v] of Object.entries(snap[d])) {
      total[k as FunnelStep] = (total[k as FunnelStep] ?? 0) + (v ?? 0);
    }
  }

  return NextResponse.json({
    note: '記憶體儲存，重啟即清零；serverless 多 instance 唔會加埋一齊。',
    byDay: snap,
    total,
    funnel: conversionRates(total),
  });
}
