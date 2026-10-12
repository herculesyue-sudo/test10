import { NextResponse } from 'next/server';
import { getVisitStore, normalizePhone } from '@/lib/visits';
import { getLeadStore } from '@/lib/leads';

export const runtime = 'nodejs';

/**
 * 客人紀錄嘅職員 API。
 *
 * ── 授權 ──
 * 由 middleware 統一把關：'/api/records' 喺 STAFF_PATHS 入面，冇有效
 * drt_staff cookie 嘅請求去唔到呢度（API 路徑回 JSON 401/403，唔係
 * HTML 頁）。呢度唔再檢查一次 —— 兩個地方各檢一半先係漏洞溫床。
 *
 * ── 刻意冇 POST ──
 * 寫入只可以經 /api/consult 嘅分析流程（server 自己計分自己寫）。
 * 開一個公開寫入口等於俾人隨便屈客人有咩皮膚問題。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawPhone = url.searchParams.get('phone');

  try {
    const store = await getVisitStore();

    // 冇 phone：淨係報 store 狀態，俾 /records 決定使唔使出「未接資料庫」警告
    if (!rawPhone) {
      return NextResponse.json({ persistent: store.persistent });
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return NextResponse.json({ error: '電話號碼格式唔啱（要 8 位香港號碼）' }, { status: 400 });
    }

    const visits = await store.listByPhone(phone);
    return NextResponse.json({ persistent: store.persistent, phone, visits });
  } catch {
    return NextResponse.json({ error: '資料庫暫時有問題，請再試' }, { status: 500 });
  }
}

/** PDPO 刪除請求：visits ＋ leads 一齊刪（唔可以剩低半份 PII），回覆刪咗幾多筆。 */
export async function DELETE(req: Request) {
  const rawPhone = new URL(req.url).searchParams.get('phone');
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (!phone) {
    return NextResponse.json({ error: '電話號碼格式唔啱（要 8 位香港號碼）' }, { status: 400 });
  }
  try {
    const store = await getVisitStore();
    const deleted = await store.deleteByPhone(phone);
    const leadsDeleted = await getLeadStore().deleteByPhone(phone);
    return NextResponse.json({ deleted, leadsDeleted });
  } catch {
    return NextResponse.json({ error: '資料庫暫時有問題，請再試' }, { status: 500 });
  }
}
