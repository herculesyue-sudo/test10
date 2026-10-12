'use client';

/**
 * 療程時間線 —— 將目錄現有嘅 onset（見效）/ duration（維持）字串
 * 畫成一條橫向時間軸。
 *
 * 合規邊界：標籤**原文照用目錄字串**，唔生成任何新嘅療效聲稱；
 * 解析唔到嘅字串（「即時」「由醫生評估後決定」…）就唔畫，
 * 交返俾卡片本身嘅文字行。腳注恆常帶「因人而異」。
 */

/** 「N–M 日/星期/個月」→ 星期數（取上限，冇上限就用下限）。解析唔到 → null */
function toWeeks(s: string): number | null {
  const m = s.match(/(\d+)(?:\s*[–\-~至]\s*(\d+))?\s*(日|星期|個月|个月|月)/);
  if (!m) return null;
  const n = Number(m[2] ?? m[1]);
  const unit = m[3];
  if (unit === '日') return n / 7;
  if (unit === '星期') return n;
  return n * 4.33; // 個月
}

export default function TreatmentTimeline({ onset, duration }: { onset: string; duration: string }) {
  const onsetWk = toWeeks(onset);
  const durWk = toWeeks(duration);
  if (onsetWk === null && durWk === null) return null;

  // sqrt 比例：維持期（可以係 24 個月）先唔會將見效期（幾星期）壓到睇唔見
  const a = Math.sqrt(Math.max(onsetWk ?? 0, 0.5));
  const b = Math.sqrt(Math.max(durWk ?? 0, 0));
  const total = a + b || 1;
  const onsetPct = durWk === null ? 100 : Math.round((a / total) * 100);

  return (
    <div className="timeline" aria-label="療程時間線（示意）">
      <div className="tl-track" aria-hidden="true">
        {onsetWk !== null && <i className="tl-onset" style={{ width: `${onsetPct}%` }} />}
        {durWk !== null && <i className="tl-dur" style={{ width: `${100 - (onsetWk !== null ? onsetPct : 0)}%` }} />}
      </div>
      <div className="tl-labels">
        {onsetWk !== null && (
          <span>
            <i className="sw onset" aria-hidden="true" />
            見效：{onset}
          </span>
        )}
        {durWk !== null && (
          <span>
            <i className="sw dur" aria-hidden="true" />
            維持：{duration}
          </span>
        )}
      </div>
    </div>
  );
}
