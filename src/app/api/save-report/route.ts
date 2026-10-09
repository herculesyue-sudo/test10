import { NextResponse } from 'next/server';
import { getVisitStore, normalizeHKCNMobile, normalizeWechatId, type VisitRecord } from '@/lib/visits';
import { getLeadStore, type LeadRecord } from '@/lib/leads';
import { getPendingStore } from '@/lib/pending-reports';
import { verifyTurnstile } from '@/lib/turnstile';
import { clientIp } from '@/lib/ratelimit';
import type { CategoryKey } from '@/lib/categories';

export const runtime = 'nodejs';

/**
 * 自願留資：保存報告 ＋ 跟進同意 ＋（可選）推廣同意。
 *
 * 2026-10 流程改版嘅落點。基本分析唔使留電話；客人睇完報告之後，
 * 如果覺得有用，可以自願留電話：
 *   ① 保存今次分析摘要（評分、觀察項目、目標）＋ WhatsApp 跟進 —— 必剔
 *   ② 日後優惠／資訊推廣 —— 獨立 opt-in，預設唔剔
 *
 * ── 點解憑 reportId 而唔係由前端 POST 成份報告返嚟 ──
 * 前端交返嚟嘅嘢任何人都可以偽造。分析成功嗰陣 server 已經將冇個人
 * 資料嘅摘要寫咗落 pending_reports，呢度只係將電話 attach 落去。
 * reportId 係 crypto.randomUUID，唔可以估；take() 係一次性（DELETE …
 * RETURNING），用完即刪，重放唔到。
 *
 * ── PDPO 位 ──
 * 三個同意係分開嘅：相片處理（分析前，Consent.tsx）、保存＋跟進
 * （呢度嘅 saveConsent，必剔）、日後推廣（marketingConsent，自願）。
 * 刪除請求照舊行 /api/records DELETE（visits＋leads 一齊刪）。
 */

interface Body {
  reportId?: string;
  phone?: string;
  name?: string;
  /** WeChat ID（可選，內地客用） */
  wechat?: string;
  saveConsent?: boolean;
  marketingConsent?: boolean;
  turnstileToken?: string;
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return bad('請求格式錯誤');
  }

  if (!body.saveConsent) {
    return bad('請先剔「同意保存分析摘要同跟進安排」先可以保存');
  }

  const phone = normalizeHKCNMobile(body.phone ?? '');
  if (!phone) {
    return bad('請輸入香港（8 位）或內地（11 位，1 字頭）手機號碼');
  }
  const wechat = body.wechat?.trim() ? (normalizeWechatId(body.wechat!) ?? undefined) : undefined;
  if (body.wechat?.trim() && !wechat) {
    return bad('WeChat ID 格式唔啱（6–20 位，字母開頭，淨係字母／數字／底線／減號）');
  }

  const ts = await verifyTurnstile(body.turnstileToken, clientIp(req));
  if (!ts.ok) return bad(ts.reason ?? '安全驗證失敗，請重試。', 403);

  const reportId = (body.reportId ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) {
    return bad('報告憑證無效。請重新分析之後即刻保存。');
  }

  let persistent = false;
  try {
    const pendingStore = getPendingStore();
    persistent = pendingStore.persistent;
    const payload = await pendingStore.take(reportId);
    if (!payload) {
      return bad(
        '呢份報告嘅暫存紀錄已經過期或者被用咗。你嘅分析結果唔受影響 —— 想保存嘅話，麻煩重新分析一次，完成後即刻留電話。',
        410,
      );
    }

    // 寫正式紀錄。兩個 store 各自 try —— 一個衰咗唔好拖累另一個，
    // 但錯誤要講返俾客人知（佢剔咗同意，有權知有冇真係儲到）。
    let visitSaved = false;
    let leadSaved = false;

    try {
      const store = await getVisitStore();
      persistent = store.persistent && persistent;
      const visit: VisitRecord = {
        id: crypto.randomUUID(),
        phone,
        createdAt: new Date().toISOString(),
        source: 'customer',
        ageBand: payload.ageBand,
        goals: payload.goals,
        categoryScores: payload.categoryScores.map((c) => ({
          key: c.key as CategoryKey,
          score: c.score,
          lowConfidence: c.lowConfidence,
        })),
        findings: payload.findings,
      };
      await store.save(visit);
      visitSaved = true;
    } catch (err) {
      console.error('[save-report] visit 寫入失敗:', (err as Error).message);
    }

    try {
      const lead: LeadRecord = {
        id: crypto.randomUUID(),
        phone,
        name: body.name?.trim() || undefined,
        createdAt: new Date().toISOString(),
        goals: payload.goals as LeadRecord['goals'],
        topFindings: payload.topFindings,
        status: 'new',
        source: 'customer',
        utm: payload.utm,
        marketingOptIn: body.marketingConsent === true,
        wechat,
      };
      await getLeadStore().add(lead);
      leadSaved = true;
    } catch (err) {
      console.error('[save-report] lead 寫入失敗:', (err as Error).message);
    }

    return NextResponse.json({ saved: visitSaved || leadSaved, persistent, visitSaved, leadSaved });
  } catch (err) {
    console.error('[save-report] 失敗:', (err as Error).message);
    return bad('儲存失敗，請稍後再試。你嘅分析結果唔受影響。', 500);
  }
}
