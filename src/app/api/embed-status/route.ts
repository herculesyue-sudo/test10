import { NextResponse } from 'next/server';
import { allowedOrigins } from '@/lib/embed-config';

export const runtime = 'nodejs';

/**
 * 俾 /embed/setup 睇下允許清單設咗未。
 *
 * 只回自己嘅設定（診所自己個網域），唔算敏感 —— 而且呢個資訊喺 HTTP
 * response header 嘅 CSP 入面本來就睇得到，收埋只會令診所自己 debug 唔到。
 */
export async function GET() {
  const origins = allowedOrigins();
  return NextResponse.json({ configured: origins.length > 0, origins });
}
