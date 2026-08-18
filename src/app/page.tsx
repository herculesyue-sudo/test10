/**
 * MVP：俾客人用嘅最短路徑（獨立頁面版）。
 *
 * 一版過，唔分步驟：影相 → 揀想改善 → 撳一下 → 出結果 → 預約。
 *
 * 刻意省略咗（喺 /pro 有）：側面相、年齡性別、預算、停工期、模式選擇、
 * 分階段方案、逐項療程詳情。每加一格輸入就跌一批客人；MVP 嘅目標
 * 唔係做到最準，而係搵出「客人肯唔肯影相同肯唔肯㩒預約」。
 *
 * 流程本體喺 ConsultFlow —— 同 /embed（嵌入診所官網嗰個）共用同一份。
 */

import ConsultFlow from '@/components/ConsultFlow';

export default function Page() {
  return (
    <div className="wrap">
      <ConsultFlow />
    </div>
  );
}
