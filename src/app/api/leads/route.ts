import { NextResponse } from 'next/server';
import { getLeadStore, LEAD_STATUSES, type LeadStatus } from '@/lib/leads';

export const runtime = 'nodejs';

/**
 * 跟進名單嘅職員 API。
 *
 * 授權同 /api/records 一樣由 middleware 統一把關（'/api/leads' 喺
 * STAFF_PATHS 入面）—— 呢度唔再檢查一次。
 *
 * 刻意冇 POST：lead 只可以由 /api/consult 嘅分析流程寫入（客人剔咗
 * 同意先有），開公開寫入口等於俾人塞垃圾入個名單。
 * 刪除行 /api/records 嘅 DELETE（PDPO 刪除鏈一齊刪）。
 */
export async function GET() {
  try {
    const store = getLeadStore();
    const leads = await store.listRecent(100);
    return NextResponse.json({ persistent: store.persistent, leads });
  } catch {
    return NextResponse.json({ error: '資料庫暫時有問題，請再試' }, { status: 500 });
  }
}

/** 職員更新跟進狀態（新 → 已聯絡 → 已預約／冇興趣）。 */
export async function PATCH(req: Request) {
  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 });
  }
  if (!body.id || !(LEAD_STATUSES as readonly string[]).includes(body.status ?? '')) {
    return NextResponse.json({ error: '要有 id 同有效 status' }, { status: 400 });
  }
  try {
    const updated = await getLeadStore().setStatus(body.id, body.status as LeadStatus);
    if (!updated) return NextResponse.json({ error: '搵唔到呢筆 lead' }, { status: 404 });
    return NextResponse.json({ updated: true });
  } catch {
    return NextResponse.json({ error: '資料庫暫時有問題，請再試' }, { status: 500 });
  }
}
