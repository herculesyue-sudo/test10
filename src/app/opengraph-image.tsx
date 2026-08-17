import { ImageResponse } from 'next/og';
import { CLINIC_POLICY } from '@/lib/treatments/clinic';

/**
 * 分享預覽圖，build 時由 Next 產生，唔使搵設計師出圖。
 *
 * 刻意淨係用純文字同色塊：OG 圖入面唔可以放樣本相或者療程前後對比 ——
 * 一嚟涉及客人肖像同意，二嚟香港《不良廣告（醫藥）條例》下用療效相
 * 做宣傳係高風險。文字版零風險，而且喺 WhatsApp 細細張都睇得清楚。
 */
export const runtime = 'nodejs';
export const alt = 'AI 免費面部分析';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  const clinic = process.env.NEXT_PUBLIC_CLINIC_NAME || CLINIC_POLICY.name;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 90px',
          background: 'linear-gradient(135deg, #16150f 0%, #2a2718 100%)',
          color: '#fbfaf8',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 6, color: '#c9a961', marginBottom: 26 }}>
          {clinic}
        </div>
        <div style={{ fontSize: 86, fontWeight: 700, lineHeight: 1.15 }}>AI 免費面部分析</div>
        <div style={{ fontSize: 38, color: '#b8b3a3', marginTop: 26 }}>
          自拍一張相 · 30 秒睇到適合你嘅療程方向
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 52,
            paddingTop: 26,
            borderTop: '2px solid #3d3a2a',
            fontSize: 24,
            color: '#8a8578',
          }}
        >
          初步參考，並非醫學診斷 · 注射及高能量儀器療程須由註冊醫生評估
        </div>
      </div>
    ),
    size,
  );
}
