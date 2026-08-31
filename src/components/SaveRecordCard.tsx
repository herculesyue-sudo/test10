'use client';

import { normalizePhone, RETENTION_MONTHS } from '@/lib/visits';
import { CLINIC_POLICY } from '@/lib/treatments/clinic';

/**
 * 「保存今次紀錄」—— 獨立自願卡。
 *
 * 刻意同相片同意（Consent.tsx）完全分開：相片仍然唔會儲存，嗰份同意
 * 文字一個字都唔使改。呢度係另一份、範圍窄好多嘅同意：電話 + 評分數字。
 *
 * 預設唔剔、留唔留都唔影響分析 —— 每加一格輸入就跌一批客人，所以
 * 呢張卡由標題開始就講明「可選」。
 */
export default function SaveRecordCard({
  phone,
  onPhone,
  consented,
  onConsent,
  staffMode = false,
}: {
  phone: string;
  onPhone: (v: string) => void;
  consented: boolean;
  onConsent: (v: boolean) => void;
  /** /pro：職員代客操作，同意字眼唔同 */
  staffMode?: boolean;
}) {
  const invalid = phone.trim() !== '' && normalizePhone(phone) === null;

  return (
    <div className="card">
      <h2>
        {staffMode ? '保存客人紀錄' : '想保存今次嘅分析紀錄？'}
        <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'var(--text-dim)' }}>（可選）</span>
      </h2>
      <p className="sub">
        留唔留都唔影響今次結果。同意嘅話，下次再分析就可以對比 8 大範疇評分嘅變化。
      </p>
      {staffMode ? (
        <>
          <label className="f" htmlFor="rec-phone">
            手機號碼（香港 8 位數字）
          </label>
          <input
            id="rec-phone"
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
        </>
      ) : (
        // 客人版：電話已經喺上面「聯絡資料」填咗，唔使入兩次
        <p style={{ fontSize: '0.84rem', margin: '0 0 4px' }}>
          會用你上面填嘅電話{phone.trim() ? <>：<b>{phone}</b></> : '（請先喺上面填電話）'}
        </p>
      )}
      <label className="check">
        <input type="checkbox" checked={consented} onChange={(e) => onConsent(e.target.checked)} />
        <span>
          {staffMode
            ? `客人已口頭同意儲存評分紀錄（唔包括相片），保留期最長 ${RETENTION_MONTHS} 個月，客人可以隨時要求刪除。`
            : `我同意 ${CLINIC_POLICY.name} 用我嘅電話號碼儲存今次嘅 8 大範疇評分同觀察項目編號（唔包括相片、唔包括文字描述），保留期最長 ${RETENTION_MONTHS} 個月，用途係下次分析或者面診時對比變化。我可以隨時聯絡診所要求刪除呢啲紀錄。`}
        </span>
      </label>
      <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', margin: '10px 0 0' }}>
        唔會儲存你嘅相片；相片仍然只用嚟即時分析。
      </p>
    </div>
  );
}
