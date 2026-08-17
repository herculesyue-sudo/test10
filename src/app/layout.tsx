import type { Metadata, Viewport } from 'next';
import { CLINIC_POLICY } from '@/lib/treatments/clinic';
import './globals.css';

/**
 * 分享預覽（Open Graph）。
 *
 * 呢個工具喺香港最主要嘅傳播途徑係 WhatsApp / IG DM —— 傳條冇預覽卡嘅
 * 光禿禿連結出去，收到嘅人根本唔知係咩，點擊率會低好多。呢度嘅成本
 * 係零，但係直接影響到有幾多人肯撳入嚟。
 *
 * NEXT_PUBLIC_SITE_URL 要填正式網址，否則 OG 圖用相對路徑喺
 * WhatsApp 度出唔到（爬蟲唔知去邊度攞張圖）。
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
const CLINIC = process.env.NEXT_PUBLIC_CLINIC_NAME || CLINIC_POLICY.name;

const TITLE = `AI 免費面部分析 · ${CLINIC}`;
const DESCRIPTION =
  '自拍一張相，30 秒睇到適合你嘅療程方向。AI 分析皮膚狀況同面部輪廓，配對診所實際提供嘅療程。結果屬初步參考，並非醫學診斷。';

export const metadata: Metadata = {
  ...(SITE_URL ? { metadataBase: new URL(SITE_URL) } : {}),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: TITLE,
  openGraph: {
    type: 'website',
    locale: 'zh_HK',
    siteName: CLINIC,
    title: TITLE,
    description: DESCRIPTION,
    ...(SITE_URL ? { url: SITE_URL } : {}),
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  // 報告係個人化結果，唔應該入搜尋器索引
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfaf8' },
    { media: '(prefers-color-scheme: dark)', color: '#16150f' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body>{children}</body>
    </html>
  );
}
