'use client';

/**
 * 嵌入版 —— 俾診所官網用 iframe 載入。
 *
 * 同 `/` 嘅分別只有三樣：
 *   1. 冇大標題（客人已經喺官網嘅版面入面，唔應該好似入咗第二個網站）
 *   2. 背景透明，跟父頁面顏色
 *   3. 主動報高度俾父頁面，避免 iframe 入面再有 scrollbar
 *
 * 功能完全一樣，因為兩邊共用 ConsultFlow。
 */

import { useEffect } from 'react';
import ConsultFlow from '@/components/ConsultFlow';
import { startHeightSync } from '@/lib/embed-client';

export default function EmbedPage() {
  useEffect(() => startHeightSync(), []);

  return (
    <div className="wrap embed">
      <ConsultFlow embedded />
    </div>
  );
}
