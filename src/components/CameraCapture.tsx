'use client';

/**
 * 頁面內即時相機 —— 見到自己、對準、㩒一下就影。
 *
 * ── 點解唔淨係用 <input type="file" capture> ──
 *
 * file input 會跳去系統相機 app：客人離開咗個頁面、影完再返嚟，中間
 * 冇任何引導。佢唔知要幾遠、唔知要唔要對正、唔知而家光線夠唔夠。
 *
 * 即時相機可以喺**影之前**就引導：面部輪廓框叫佢對準距離同角度，
 * 光線指示喺太暗／過曝嘅時候即刻話佢知。呢個係準確度改善，唔止係
 * 體驗改善 —— 一張對得正、光線啱嘅相，最平嘅模型都分析得好過一張
 * 歪咗、背光嘅相俾最貴嘅模型。
 *
 * ── 一定要有 fallback ──
 *
 * getUserMedia 需要 secure context（https 或 localhost），而且客人
 * 可以拒絕權限。任何一個情況都要靜靜地退回 file input —— 唔可以
 * 因為開唔到鏡頭就令個客人乜都做唔到。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { analysePixels, THRESHOLDS } from '@/lib/photo-check';

/** 長邊縮到 2000px、JPEG q0.9 —— 同 PhotoCapture 一致。 */
const MAX_EDGE = 2000;

type Phase = 'idle' | 'starting' | 'live' | 'denied' | 'unsupported';

export default function CameraCapture({
  onCapture,
  onFallback,
}: {
  onCapture: (shot: { data: string; preview: string }) => void;
  /** 開唔到鏡頭嗰陣叫呢個，等上層顯示 file input */
  onFallback: (reason: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [light, setLight] = useState<'ok' | 'dark' | 'bright' | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // 離開頁面一定要熄鏡頭，否則部電話個綠燈會一直着住 —— 客人會嚇親
  useEffect(() => stop, [stop]);

  async function start() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setPhase('unsupported');
      onFallback('呢個瀏覽器唔支援頁面內相機');
      return;
    }
    setPhase('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          // 要夠解像度先睇到毛孔同色斑；理想值，攞唔到會自動降
          width: { ideal: 1920 },
          height: { ideal: 1920 },
        },
        audio: false,
      });
      streamRef.current = stream;
      // ⚠️ 唔可以喺呢度就 srcObject = stream。
      // 而家 phase 仲係 'starting'，個 <video> 未 render，videoRef.current 係
      // null —— 條 stream 會靜靜雞冇咗，個畫面永遠黑，而且冇任何錯誤。
      // 所以：先切去 'live' 令 <video> 出現，再喺下面個 effect 接駁。
      setPhase('live');
    } catch (e) {
      const err = e as DOMException;
      setPhase('denied');
      // NotAllowedError 有兩個成因：客人自己撳咗拒絕，或者我哋個 iframe
      // 冇攞到 Permissions-Policy 授權（官網嵌入嗰邊嘅設定問題）。
      // 錯誤訊息唔可以賴錯人：政策封鎖唔可以賴客人，客人拒絕亦唔可以
      // 賴去官網設定度（否則職員會走去 debug 一個唔存在嘅設定問題）。
      // featurePolicy 探測（Chromium 有）三個結果要分開處理：
      //   false → 政策封鎖，肯定係嵌入設定問題
      //   true  → 政策開放，NotAllowedError 就肯定係客人／瀏覽器層面拒絕
      //   冇呢個 API（Safari/Firefox）→ 喺 iframe 入面先至含糊，要對沖字眼
      // 唔用 navigator.permissions.query：舊 iOS Safari 冇，而且係 async。
      const framed = typeof window !== 'undefined' && window.parent !== window;
      const policyAllows = (document as Document & {
        featurePolicy?: { allowsFeature?: (f: string) => boolean };
      }).featurePolicy?.allowsFeature?.('camera');
      onFallback(
        err.name === 'NotAllowedError'
          ? policyAllows === false
            ? '內嵌版面未開放相機權限'
            : framed && policyAllows === undefined
              ? '開唔到相機（可能係內嵌版面未開放相機權限）'
              : '你拒絕咗相機權限'
          : err.name === 'NotFoundError'
            ? '搵唔到相機'
            : location.protocol !== 'https:' && location.hostname !== 'localhost'
              ? '要 https 先開得到頁面內相機'
              : '開唔到相機',
      );
    }
  }

  // <video> render 咗之後先接駁條 stream。
  useEffect(() => {
    if (phase !== 'live') return;
    const v = videoRef.current;
    const stream = streamRef.current;
    if (!v || !stream) return;
    v.srcObject = stream;
    v.play().catch(() => {
      // 部分瀏覽器要用戶手勢先 play 得 —— 但我哋本身就係由㩒掣入嚟，
      // 真係失敗就退回 file input，唔好留一個黑畫面俾客人望。
      setPhase('denied');
      onFallback('個鏡頭畫面播放唔到');
    });
  }, [phase, onFallback]);

  // 即時光線檢查：喺**影之前**就話佢知，好過影完先話張相唔用得
  useEffect(() => {
    if (phase !== 'live') return;
    const id = setInterval(() => {
      const v = videoRef.current;
      if (!v || !v.videoWidth) return;
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, 64, 64);
      const { brightness } = analysePixels(ctx.getImageData(0, 0, 64, 64).data, 64, 64);
      setLight(brightness < THRESHOLDS.DARK ? 'dark' : brightness > THRESHOLDS.BRIGHT ? 'bright' : 'ok');
    }, 700);
    return () => clearInterval(id);
  }, [phase]);

  function shoot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;

    const scale = Math.min(1, MAX_EDGE / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    // 前置鏡頭預覽係鏡像（睇落自然），但**存落嚟唔可以鏡像** ——
    // 否則報告會講「左面頰有色斑」而實際喺右邊，醫生對唔返位。
    ctx.drawImage(v, 0, 0, w, h);

    const url = c.toDataURL('image/jpeg', 0.9);
    stop();
    setPhase('idle');
    onCapture({ data: url.split(',')[1], preview: url });
  }

  if (phase === 'idle' || phase === 'starting') {
    return (
      <button type="button" className="primary cam-start" onClick={start} disabled={phase === 'starting'}>
        {phase === 'starting' ? '開緊相機…' : '📷 開相機自拍'}
      </button>
    );
  }

  if (phase === 'denied' || phase === 'unsupported') return null; // 上層會顯示 fallback

  return (
    <div className="cam">
      <div className="cam-stage">
        <video ref={videoRef} playsInline muted autoPlay />
        {/* 輪廓框：叫客人對準距離同角度。冇呢個，十個人影十個唔同大細。 */}
        <svg className="cam-guide" viewBox="0 0 100 130" aria-hidden="true">
          <ellipse cx="50" cy="62" rx="31" ry="41" />
        </svg>
        <div className={`cam-hint ${light ?? ''}`}>
          {light === 'dark'
            ? '太暗喇 —— 行埋窗邊'
            : light === 'bright'
              ? '太光喇 —— 避開直射光'
              : '將塊面對準個框，唔好笑'}
        </div>
      </div>
      <button type="button" className="primary cam-shoot" onClick={shoot}>
        影相
      </button>
      <button
        type="button"
        className="ghost"
        style={{ width: '100%', marginTop: 8 }}
        onClick={() => {
          stop();
          setPhase('idle');
        }}
      >
        取消
      </button>
    </div>
  );
}
