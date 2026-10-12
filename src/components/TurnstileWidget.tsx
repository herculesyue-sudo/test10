'use client';

import { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile widget（機械人閘嘅前端半邊）。
 *
 * 冇設定 NEXT_PUBLIC_TURNSTILE_SITE_KEY 就咩都唔 render —— 同後端
 * turnstile.ts 一樣：未攞 key 之前成個功能係熄嘅，本機 dev 唔受影響。
 * 對正常客人多數係隱形（managed mode），可疑流量先會見到挑戰格。
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
    __drtTurnstileOnload?: () => void;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!SITE_KEY || !holder.current || rendered.current) return;
    rendered.current = true;

    const render = () => {
      if (!holder.current || !window.turnstile) return;
      window.turnstile.render(holder.current, {
        sitekey: SITE_KEY,
        callback: (t: string) => cb.current(t),
        'expired-callback': () => cb.current(''),
        'error-callback': () => cb.current(''),
        'refresh-expired': 'auto',
        theme: 'auto',
      });
    };

    if (window.turnstile) {
      render();
      return;
    }
    window.__drtTurnstileOnload = render;
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__drtTurnstileOnload';
    s.async = true;
    document.head.appendChild(s);
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={holder} style={{ margin: '4px 0 10px' }} />;
}

/** 提交失敗後 reset，攞個新 token（token 係一次性嘅）。 */
export function resetTurnstile(): void {
  try {
    window.turnstile?.reset();
  } catch {
    /* widget 未 render 過 —— 冇嘢要 reset */
  }
}

export const TURNSTILE_CONFIGURED = !!SITE_KEY;
