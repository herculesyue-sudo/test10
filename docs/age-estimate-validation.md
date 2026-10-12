# 「AI 相片外觀年齡估算」驗證計劃

功能已實作（schema / prompt / postprocess / 共識合併 / 結果頁對比卡），
但**預設關閉**（`AGE_ESTIMATE_ENABLED` + `NEXT_PUBLIC_AGE_ESTIMATE_ENABLED`，
兩個要一齊開先出街）。呢份文件定義「乜嘢先叫驗證咗」，未達標唔好開。

## 點解要驗證先開

估齡係成個工具入面最易誤導嘅數字。其他觀察有「信心值＋相片限制聲明」
包住，但「你塊面睇落 42 歲」呢類數字嘅情緒衝擊大好多 —— 一個唔準嘅
估齡，比冇估齡更差（製造焦慮係我哋明確唔做嘅嘢）。

## 供應商政策（已查證）

- **Vertex AI 訓練限制**：Google Cloud Service Specific Terms 第 17 條 —
  未經許可唔會用客戶資料訓練模型。查證日期：2026-10-08。
  來源：cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention
- **估齡用途**：Google Prohibited Use Policy 禁嘅係人臉**識別／身份辨認**；
  年齡範圍估算唔屬禁止類。估齡唔可以做身份聲稱（「呢個係邊個」），
  我哋亦冇做。查證日期：2026-10-08。

## 已內置嘅誠實機制（code 保證，唔係 prompt 請求）

| 規則 | 喺邊執行 |
|---|---|
| 估齡時真實年齡唔入 prompt（唔俾答案影響估算） | `api/consult/route.ts`：`AGE_ESTIMATE_ENABLED` 開咗就唔傳 `age` |
| 範圍過闊（>15 年）／上下限倒轉／小數 → 棄用 | `postprocess.ts` rule `age-estimate-drop` |
| 模型冇把握 → 欄位留空 → UI 顯示「未能可靠估算」 | `AgeEstimateCard.tsx` |
| 多次共識：過半數 runs 冇估 → 棄用；有就取中位數 | `anthropic.ts` analyzeWithConsensus |
| 相片質素差（usability 唔 ok）照出，但卡會講明限制 | `MvpResult.tsx` |
| 未成年人：prompt 指示唔好估；UI 輸入限 18–100 | `prompt.ts` / `AgeEstimateCard.tsx` |
| 真實年齡落喺範圍內 → 「相符」，唔揀最高數 | `AgeEstimateCard.tsx` comparison |
| flag 冇開 → 就算模型自己作個數都會被剝走 | `api/consult/route.ts` 防禦性 delete |

## 驗證方案（開關之前要做晒）

### 1. 測試集

- **人數**：最少 40 位自願者，簽咗知情同意（用途：模型驗證；相片唔會儲存，
  驗證完即刪）。**唔准用真實客人相片**（未經授權唔可以過外部 API）。
- **覆蓋**：
  - 年齡：20s / 30s / 40s / 50s+ 各最少 8 人（目標客群係 25–55，要覆蓋）
  - 膚色：Fitzpatrick II–IV 為主（香港客群），每型最少 8 人
  - 裝置：iPhone 前鏡、Android 前鏡各半；室內自然光
  - 每人 2 張：素顏自然光正面 ×2（相隔幾分鐘，測重拍一致性）
  - 另加 8 張「干擾組」：濃妝 / 美顏濾鏡 / 頂光 / 側面 —— 呢啲應該
    觸發「未能可靠估算」而唔係照出數

### 2. 量度

- **MAE**：估算範圍中點 vs 真實年齡嘅平均絕對誤差
- **命中率**：真實年齡落喺範圍內嘅比例
- **棄估率**：模型拒絕估算嘅比例（干擾組應該高，正常組應該低）
- **重拍一致性**：同一人兩張相嘅範圍中點差異

### 3. 達標門檻（全部過晒先開）

| 指標 | 門檻 |
|---|---|
| MAE | ≤ 5 歲 |
| 命中率 | ≥ 70% |
| 正常組棄估率 | ≤ 20% |
| 干擾組棄估率 | ≥ 50%（要識得拒絕） |
| 重拍中點差異 | ≤ 3 歲（中位數） |
| 文案覆核 | 合作醫生／法律顧問睇過對比卡三種結局嘅措辭 |

### 4. 跑法

```bash
# 用 compare/eval 嘅基建，加一個估齡 mode（todo：scripts/eval-age.ts）
# 暫時可以手工：開住 DEMO_MODE=0 + AGE_ESTIMATE_ENABLED=1 喺 preview 部署
# 逐張相入，記低範圍，再同真實年齡對
```

### 5. 開關程序

1. 驗證達標 → 文件度記低結果（日期、樣本數、MAE、命中率）
2. `wrangler vars` 加 `AGE_ESTIMATE_ENABLED=1`，`NEXT_PUBLIC_AGE_ESTIMATE_ENABLED=1`
3. 重新 build + deploy（NEXT_PUBLIC_ 係 build 時烘入）
4. 上架後頭兩星期：人手抽查 10 份報告嘅估齡合理性
5. 任何時候想停：兩個 vars 設返 0，重新 deploy —— 冇數據遺留
   （估齡結果唔會寫入 D1）

## 明確唔做嘅嘢

- 唔做「皮膚年齡」「生理年齡」命名
- 唔做「做完療程年輕 X 歲」嘅前後對比
- 唔將估齡差距用嚟推高客單價（「睇落老咗 8 歲 → 推薦貴療程」呢條路永久封閉）
- 唔向未成年人提供估齡
