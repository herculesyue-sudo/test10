'use client';

import { useRef, useState } from 'react';

export interface Shot {
  angle: string;
  label: string;
  required: boolean;
  /** base64（唔含 data: 前綴） */
  data?: string;
  mediaType?: 'image/jpeg';
  preview?: string;
}

export const DEFAULT_SHOTS: Shot[] = [
  { angle: '正面', label: '正面', required: true },
  { angle: '左側 45°', label: '左側 45°', required: false },
  { angle: '右側 45°', label: '右側 45°', required: false },
];

/** 長邊縮到 2000px 內、轉 JPEG q0.9 —— 貼近模型高解析度上限，同時避免上傳過大。 */
const MAX_EDGE = 2000;

async function normalise(file: File): Promise<{ data: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('瀏覽器唔支援 canvas');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  return { data: dataUrl.split(',')[1], preview: dataUrl };
}

export default function PhotoCapture({
  shots,
  onChange,
}: {
  shots: Shot[];
  onChange: (s: Shot[]) => void;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handle(i: number, file: File | undefined) {
    if (!file) return;
    setErr(null);
    setBusy(i);
    try {
      const { data, preview } = await normalise(file);
      const next = [...shots];
      next[i] = { ...next[i], data, preview, mediaType: 'image/jpeg' };
      onChange(next);
    } catch {
      setErr('讀取相片失敗，請試另一張。');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="shots">
        {shots.map((s, i) => (
          <button
            key={s.angle}
            type="button"
            className={`shot${s.preview ? ' filled' : ''}`}
            onClick={() => inputs.current[i]?.click()}
            aria-label={`上載${s.label}相片`}
          >
            {s.preview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.preview} alt={s.label} />
                <span className="tag">{s.label} ✓</span>
              </>
            ) : busy === i ? (
              <span>處理中…</span>
            ) : (
              <>
                <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>＋</span>
                <span className={s.required ? 'req' : undefined}>
                  {s.label}
                  {s.required ? ' *' : ''}
                </span>
              </>
            )}
            <input
              ref={(el) => {
                inputs.current[i] = el;
              }}
              type="file"
              accept="image/*"
              capture="user"
              hidden
              onChange={(e) => handle(i, e.target.files?.[0])}
            />
          </button>
        ))}
      </div>
      {err && <p style={{ color: 'var(--danger)', fontSize: '0.82rem' }}>{err}</p>}
    </>
  );
}
