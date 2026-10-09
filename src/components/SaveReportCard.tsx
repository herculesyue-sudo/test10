'use client';

import { useState } from 'react';
import { normalizeHKCNMobile, normalizeWechatId, RETENTION_MONTHS } from '@/lib/visits';
import { CLINIC_POLICY } from '@/lib/treatments/clinic';
import TurnstileWidget, { resetTurnstile, TURNSTILE_CONFIGURED } from '@/components/TurnstileWidget';
import { trackStep } from '@/lib/track-client';

/**
 * 結果頁嘅留資卡 —— 2026-10 流程改版嘅核心。
 *
 * 舊版：電話＋跟進同意係分析**之前**嘅必答閘（趕客）。
 * 新版：基本報告直接睇；想保存報告、想我哋跟進，就留電話。
 * 呢個係正常嘅價值交換：診所付出 AI 分析成本，客人留低聯絡方法
 * 換取保存同跟進服務 —— 行業慣例，文案唔使歉疚，講清楚就得。
 *
 * 推廣同意係**獨立**嘅，預設唔剔，唔剔唔影響保存（PDPO 直接促銷
 * 要求，呢個唔係口吻問題，係法規要求）。
 *
 * 憑 reportId 認返 server 暫存嘅結果（pending-reports.ts）——
 * 呢張卡乜分析數據都唔會 POST 返上去，只有電話＋稱呼＋同意。
 */
export default function SaveReportCard({ reportId }: { reportId?: string }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [wechat, setWechat] = useState('');
  const [saveConsent, setSaveConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [tsToken, setTsToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'ok' | 'warn' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 冇 reportId（暫存失敗／demo）→ 成張卡唔出，唔好俾人一個儲唔到嘅假希望
  if (!reportId) return null;

  const phoneOk = normalizeHKCNMobile(phone) !== null;
  const invalid = phone.trim() !== '' && !phoneOk;
  const wechatInvalid = wechat.trim() !== '' && normalizeWechatId(wechat) === null;
  const tsOk = !TURNSTILE_CONFIGURED || tsToken !== '';
  const ready = phoneOk && !wechatInvalid && saveConsent && tsOk && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/save-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          phone,
          name: name.trim() || undefined,
          wechat: wechat.trim() || undefined,
          saveConsent,
          marketingConsent,
          turnstileToken: tsToken || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '儲存失敗');
      trackStep('report_saved');
      setDone(json.saved && json.persistent ? 'ok' : 'warn');
    } catch (e) {
      setError((e as Error).message);
      resetTurnstile();
      setTsToken('');
    } finally {
      setBusy(false);
    }
  }

  if (done === 'ok') {
    return (
      <div className="alert" style={{ background: 'var(--accent-soft)', textAlign: 'left' }}>
        ✅ 已幫你保存今次嘅分析摘要（唔包括相片）。職員睇到你嘅目標同觀察重點，跟進嗰陣唔使你由頭講過。
        想刪除紀錄，隨時 WhatsApp 6484 3111 講聲就得。
      </div>
    );
  }
  if (done === 'warn') {
    return (
      <div className="alert warn" style={{ textAlign: 'left' }}>
        已收到你嘅同意，但系統暫時儲存唔到完整紀錄。不妨礙你睇報告 —— 想我哋跟進，直接用下面嘅 WhatsApp 掣。
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'left', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <b style={{ fontSize: '0.95rem' }}>📌 留電話，幫你保存呢份報告</b>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', margin: '6px 0 10px', lineHeight: 1.7 }}>
        報告關咗頁就睇唔返。留低電話，我哋幫你保存摘要（8 大範疇評分＋觀察重點＋改善目標，<b>唔包相片</b>），
        第時再分析可以對比變化；有嘢唔明，職員可以經 WhatsApp 或 WeChat 跟進今次分析。
      </p>

      <label className="f" htmlFor="save-name">
        稱呼（可選）
      </label>
      <input
        id="save-name"
        type="text"
        autoComplete="name"
        placeholder="例如：陳小姐"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label className="f" htmlFor="save-phone" style={{ marginTop: 10 }}>
        手機號碼（香港 8 位 / 內地 11 位）
      </label>
      <input
        id="save-phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="9123 4567 / 138 0013 8000"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      {invalid && (
        <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: '5px 0 0' }}>
          請輸入香港手機（8 位）或內地手機（11 位，1 字頭）
        </p>
      )}
      <label className="f" htmlFor="save-wechat" style={{ marginTop: 10 }}>
        WeChat ID（可選 —— 冇 WhatsApp 嘅話我哋經 WeChat 跟進）
      </label>
      <input
        id="save-wechat"
        type="text"
        placeholder="例如：timeless_hk2026"
        value={wechat}
        onChange={(e) => setWechat(e.target.value)}
      />
      {wechatInvalid && (
        <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: '5px 0 0' }}>
          WeChat ID 格式唔啱（6–20 位，字母開頭）
        </p>
      )}

      <label className="check" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={saveConsent} onChange={(e) => setSaveConsent(e.target.checked)} />
        <span>
          我同意 {CLINIC_POLICY.name} 保存我嘅分析摘要同聯絡資料，保留期最長 {RETENTION_MONTHS} 個月，
          用途係經 WhatsApp 或 WeChat 跟進今次分析結果、安排預約，以及下次分析時對比變化。
          我可以隨時 WhatsApp 6484 3111 要求刪除。
        </span>
      </label>

      {/* 推廣同意係獨立 opt-in：PDPO 直接促銷要求講明渠道同種類，
          而且唔可以同「保存／跟進」綁埋做一個同意。預設唔剔。 */}
      <label className="check" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} />
        <span>
          我願意經 WhatsApp 收到 {CLINIC_POLICY.name} 嘅療程優惠同護膚資訊（可選；唔剔唔影響保存報告）。
          可以隨時回覆「取消」拒收。
        </span>
      </label>

      <TurnstileWidget onToken={setTsToken} />
      {error && <div className="alert danger" style={{ marginTop: 8 }}>{error}</div>}

      <button className="primary" disabled={!ready} onClick={submit} style={{ marginTop: 10, width: '100%' }}>
        {busy ? '儲存緊…' : ready ? '保存我嘅報告摘要' : !phoneOk ? '請輸入手機號碼' : !saveConsent ? '請先剔同意保存' : '安全驗證載入緊…'}
      </button>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', margin: '8px 0 0' }}>
        唔留電話都照樣睇到晒上面嘅報告。唔會儲存你嘅相片。
      </p>
    </div>
  );
}
