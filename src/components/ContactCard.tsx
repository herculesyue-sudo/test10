'use client';

import { normalizePhone } from '@/lib/visits';
import { FREE_ANALYSES_PER_PHONE } from '@/lib/quota-config';

/**
 * 客人聯絡資料 —— 電話必填（每個電話 {FREE_ANALYSES_PER_PHONE} 次免費分析），
 * 稱呼可選（傳送報告嗰陣帶埋，方便診所跟進）。
 *
 * 私隱：講到明電話唔會以原文儲存 —— 佢喺伺服器嗰邊會變成不可還原嘅
 * 編碼先入資料庫，淨係用嚟計免費次數（phone-quota.ts）。想儲低評分
 * 紀錄嚟對比，係下面另一張卡另一份同意。
 */
export default function ContactCard({
  name,
  onName,
  phone,
  onPhone,
}: {
  name: string;
  onName: (v: string) => void;
  phone: string;
  onPhone: (v: string) => void;
}) {
  const invalid = phone.trim() !== '' && normalizePhone(phone) === null;

  return (
    <div className="card">
      <h2>3. 你嘅聯絡資料</h2>
      <p className="sub">
        每個電話有 {FREE_ANALYSES_PER_PHONE} 次免費分析。分析完成後，可以一個掣將報告經 WhatsApp 傳俾我哋跟進。
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
        手機號碼（香港 8 位數字）*
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
        <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: '5px 0 0' }}>請輸入 8 位香港電話號碼</p>
      )}
      <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', margin: '10px 0 0' }}>
        電話唔會以原文儲存 —— 只會轉成不可還原嘅編碼，用嚟計免費分析次數。
      </p>
    </div>
  );
}
