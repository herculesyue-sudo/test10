import type { Metadata } from 'next';

/**
 * /embed 成個 segment 唔入搜尋器。
 *
 * /embed 係 / 嘅無頭複製品（俾官網 iframe 用）—— 俾佢入索引就係
 * duplicate content，搜尋結果仲可能出一個冇標題冇導覽嘅怪版面。
 * /embed/setup 係職員設定頁，更加唔應該索引。
 * 客人版 / 先係想俾人搵到嗰個（root layout 度 index: true）。
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
