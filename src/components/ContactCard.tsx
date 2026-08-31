'use client';

import { normalizeHKMobile, RETENTION_MONTHS } from '@/lib/visits';
import { CLINIC_POLICY } from '@/lib/treatments/clinic';
import { FREE_ANALYSES_PER_PHONE } from '@/lib/quota-config';

/**
 * 客人聯絡資料 —— 拉新客漏斗嘅入口。
 *
 * 電話必填（只收香港手機字頭 4/5/6/7/9，固網同亂噏嘅號段擋走），
 * 稱呼可選，加一個**必須剔**嘅同意：保存分析摘要＋WhatsApp 跟進。
 * 剔咗呢個，分析完成後客人資料自動入診所後台跟進名單 —— 唔使等
 * 佢自己撳「傳送報告」。
 *
 * ⚠️ 同意文字寫明用途（跟進今次分析＋預約）、保留期、刪除渠道。
 * 呢份同意唔覆蓋日後嘅推廣訊息（direct marketing）—— 想用呢個名單
 * 賣廣告要另攞 opt-in，唔好偷雞。
 */
export default function ContactCard({
  name,
  onName,
  phone,
  onPhone,
  consent,
  onConsent,
}: {
  name: string;
  onName: (v: string) => void;
  phone: string;
  onPhone: (v: string) => void;
  consent: boolean;
  onConsent: (v: boolean) => void;
}) {
  const invalid = phone.trim() !== '' && normalizeHKMobile(phone) === null;

  return (
    <div className="card">
      <h2>3. 你嘅聯絡資料</h2>
      <p className="sub">
        每個電話有 {FREE_ANALYSES_PER_PHONE} 次免費分析。分析完成後，我哋會經 WhatsApp 跟進你嘅結果同安排預約。
      </p>
      <label className="f" htmlFor="cust-name">
        稱呼（可選）
      </label>
      <input
        id="cust-name"
        type="text"
        autoComplete="name"
        placeholder="例如：陳小姐"
        value={name}
        onChange={(e) => onName(e.target.value)}
      />
      <label className="f" htmlFor="cust-phone" style={{ marginTop: 10 }}>
        手機號碼（香港手機，8 位數字）*
      </label>
      <input
        id="cust-phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="9123 4567"
        value={phone}
        onChange={(e) => onPhone(e.target.value)}
      />
      {invalid && (
        <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: '5px 0 0' }}>
          請輸入香港手機號碼（4、5、6、7、9 字頭嘅 8 位數字）
        </p>
      )}
      <label className="check" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={consent} onChange={(e) => onConsent(e.target.checked)} />
        <span>
          我同意 {CLINIC_POLICY.name} 保存我嘅分析摘要（8 大範疇評分、觀察項目編號、改善目標）同聯絡資料（稱呼、電話），
          保留期最長 {RETENTION_MONTHS} 個月，用途係經 WhatsApp 跟進今次分析結果同安排預約，以及下次分析時對比變化。
          我可以隨時 WhatsApp 6484 3111 要求刪除呢啲紀錄。*
        </span>
      </label>
      <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', margin: '10px 0 0' }}>
        唔會儲存你嘅相片；相片只用嚟即時分析。
      </p>
    </div>
  );
}
