# AI 視像面診 · 香港醫學美容

手機自拍 → AI 分析皮膚狀況同面部輪廓 → 配對香港市場可用嘅針劑同儀器療程，出分階段方案同預算估算。

用手機瀏覽器就用得，唔使裝 app。

---

## 快速開始

```bash
npm install
cp .env.example .env        # 填入 ANTHROPIC_API_KEY
npm run dev                 # http://localhost:3000
```

手機測試：`npm run dev -- -H 0.0.0.0`，再用同一個 Wi-Fi 嘅手機開 `http://<電腦IP>:3000`。
（iOS Safari 要 HTTPS 先可以用相機，用 `npx localtunnel --port 3000` 或者 Vercel 部署最方便。）

```bash
npm run test:engine   # 療程配對引擎測試（唔使 API key）
npm run eval          # 準確度量度（需要標註資料集，見下面）
npm run build
```

---

## 架構：AI 睇相，規則引擎砌方案

```
相片 ──► Claude（視覺）──► 結構化觀察 JSON ──► 本地規則引擎 ──► 療程方案
                              │                      │
                     只可以輸出「觀察」        療程庫 36 項（可改）
                     唔可以輸出療程名          價格 / 禁忌 / 規管
```

**點解要咁樣分？** 如果直接叫模型「推薦療程」，佢會憑訓練記憶講出療程名 —— 價格過時、
可能講出香港冇引入嘅產品、每次答案唔一樣、亦冇辦法俾醫生逐條 review。

拆開之後：

| | AI 負責 | 規則引擎負責 |
|---|---|---|
| 內容 | 睇相、描述觀察、評嚴重程度同信心 | 配對療程、計分、排優先次序、過濾禁忌 |
| 可改性 | 改 prompt | 改 `src/lib/treatments/*.ts`（純資料，唔使掂 AI） |
| 可審計 | 每項觀察有信心值 | 每個推薦有可追溯嘅計分公式 |

換模型、換供應商、加新療程、改價錢 —— 全部唔會互相影響。

### 主要檔案

| 路徑 | 作用 |
|---|---|
| `src/lib/prompt.ts` | 系統提示（分析準則、誠實準則、觀察指引） |
| `src/lib/schema.ts` | 輸出 schema，用 structured outputs 強制模型跟格式 |
| `src/lib/anthropic.ts` | 模型層級、成本計算、多次共識分析 |
| `src/lib/treatments/injectables.ts` | 針劑療程庫（肉毒、透明質酸、少女針、童顏針、嬰兒針…） |
| `src/lib/treatments/devices.ts` | 儀器療程庫（HIFU、射頻、皮秒、CO2、冷凍溶脂…） |
| `src/lib/treatments/index.ts` | 配對引擎 + 分階段方案 |
| `src/app/api/consult/route.ts` | API endpoint（驗證、限流保護、錯誤處理） |
| `scripts/eval.ts` | 準確度量度 |
| `scripts/test-engine.ts` | 引擎邏輯測試 |

---

## 成本：三個層級

「最平」同「最準」係對立嘅，所以做成可切換，客人揀邊個模式都得。
每次分析嘅實際成本會即時計出嚟顯示喺報告底部。

| 模式 | 模型 | 每次估算 | 用途 |
|---|---|---|---|
| 經濟 | `claude-haiku-4-5` | **約 HK$0.05** | 免費體驗版、大量初步篩選 |
| 推薦 | `claude-sonnet-5` | 約 HK$0.25 | 日常營運 |
| 最準 | `claude-opus-5` | 約 HK$0.70 | 複雜個案、VIP、正式報告 |

估算基於 1 張相 + 系統提示（約 2.5k input / 1.5k output tokens）。實際數字視乎相片解像度同輸出長度。

**已做嘅成本優化**

- **Prompt caching** — 系統提示長期不變，設咗 cache breakpoint，重複請求慳約 90% input 成本。診所一日跑幾十次，第二次開始就平好多。
- **相片壓縮** — 前端先縮到長邊 2000px（貼近模型高解析度上限），避免上傳無用嘅像素。
- **多相非必須** — 淨係正面相都跑得，加側面相準確度較高但成本亦按張數增加。

如果要再平：`CONSULT_TIER=budget` 做前置篩選，只有客人真係有意向先跑 `balanced`。

---

## 關於「準確度 90%」

講白啲：**冇任何視覺 API 可以保證單靠自拍相就做到 90% 以上嘅診斷準確度**，而任何聲稱做到嘅產品都應該要求佢出示量度方法。原因唔喺模型，喺相片本身 ——

- 化妝會遮蓋色斑同泛紅，令膚質判斷幾乎失效
- 頭頂燈會造出假陰影，睇落好似中面部凹陷
- 螢幕色差令泛紅程度唔可靠
- 好多嘢相片根本影唔到：色素喺表皮定真皮層、皮下脂肪分佈、皮膚彈性

所以呢個系統唔係去追一個報唔出嚟嘅數字，而係做三件事：

**1. 嚴重程度同信心分開輸出**

一個明顯色斑喺化咗妝嘅相入面 = 高 severity + 低 confidence。系統會照樣標示問題存在，但同時話俾客人知「呢項要現場再睇」。一個永遠好自信嘅系統，比一個知道自己幾時唔肯定嘅系統危險得多。

**2. 多次共識（可選）**

`CONSULT_PASSES=3` 會跑三次獨立分析取中位數。單次視覺判斷嘅方差主要嚟自邊緣個案（輕微色斑、早期鬆弛）；跑三次之後，「有幾多次跑出同一個觀察」本身就係一個比模型自報信心更可靠嘅指標。少過一半次數先出現嘅觀察會當雜訊丟棄。成本 ×3，建議只喺重要個案開。

**3. 可以真係量到準確度**

```bash
npm run eval -- --tier balanced --passes 1
```

要準備 `eval/dataset.json`（醫生標註嘅 ground truth）同 `eval/images/`。輸出：

- **Precision / Recall / F1** — 捉到嘅入面幾多係真、真實存在嘅捉到幾多
- **Severity MAE** — 嚴重程度評分差幾多
- **信心校準** — AI 話「信心 80%」嗰批，實際命中率係咪真係接近 80%
- **表現最差嘅特徵** — 直接指出應該改 prompt 邊一段

建議最少 40–60 個個案，由兩位醫生獨立標註後取共識。跑一次基準，改完 prompt 再跑，就知道係咪真係進步咗 —— 而唔係靠感覺。

**實際可以做到嘅期望**（基於相片限制，非承諾）：明顯特徵（中重度色斑、深法令紋、明顯鬆弛）偵測率高；輕微或模糊個案準確度顯著下降，而呢啲個案系統會主動壓低信心。

---

## 安全同合規

呢個係**諮詢輔助工具**，唔係診斷器材。系統設計上刻意做咗幾件事：

- AI 被明確禁止下診斷、判斷痣良惡性、或推薦具體療程
- 見到可疑皮膚病變會放入 `redFlags`，報告頂部彈紅色警示叫佢見皮膚科
- 每個療程都列咗禁忌症同香港規管註記
- 剔選懷孕 / 哺乳會自動硬過濾所有相關禁忌療程（有機會過濾到一個都唔剩 —— 呢個係正確行為，會顯示解釋）
- 報告底部有完整免責聲明

**香港規管重點**：注射性程序（肉毒、填充劑）同高能量激光 / 彩光，均屬衞生署界定嘅高風險醫療美容程序，**須由註冊醫生施行**。部署前請自行核實最新規例，並由診所法律顧問審閱報告文案。

**隱私**：相片經 API route 直接轉發俾 Anthropic，唔會寫入伺服器磁碟、唔會入資料庫。如果要加儲存功能（例如療程前後對比），要另外處理《個人資料（私隱）條例》嘅同意書同保留期。

---

## 改療程庫

全部係普通 TypeScript 陣列，改完 `npm run test:engine` 驗證即可。

```ts
{
  id: 'my-treatment',
  name: '療程中文名',
  brand: '品牌 / 儀器名',
  category: 'injectable',        // injectable | device | topical
  family: '分類，例如 透明質酸',
  mechanism: '一句講清楚原理',
  indications: [
    { key: 'nasolabial_fold', efficacy: 4 },   // efficacy 1（輔助）到 5（一線首選）
  ],
  sessions: '3 次為一個療程',      // 引擎會由呢度抽數字估全期成本
  interval: '每次相隔 4 星期',
  onset: '2–4 星期',
  duration: '6–12 個月',
  downtimeDays: [1, 3],
  priceHKD: { min: 3000, max: 6500, unit: '每次' },
  risk: 'medium',                 // low | medium | high
  regulation: '香港規管註記',
  contraindications: ['懷孕/哺乳', '...'],   // 含「懷孕」會被懷孕過濾器捕捉
  notes: '客人應該知嘅提醒（可選）',
}
```

`indications` 嘅 `key` 必須係 `src/lib/treatments/types.ts` 入面 `FindingKey` 之一。
要加新特徵：喺 `FindingKey` 加 key、喺 `FINDING_LABELS` 加中文名，schema 同 prompt 會自動跟住更新。

### 調整配對行為

`src/lib/treatments/index.ts` 頂部三個常數：

- `SEVERITY_FLOOR`（預設 25）—— 低過幾多分就唔觸發推薦。調高 = 保守啲
- `GOAL_BOOST`（預設 1.35）—— 客人揀咗嘅目標加幾多權重
- `SATURATION_K`（預設 1.2）—— 調細令分數升得快，調大令高分之間差距拉開

---

## 部署注意

`/api/consult` 設咗 `maxDuration = 300`（秒）。`max` 模式加 3 次共識分析可以跑到 2–3 分鐘。

- **Vercel Hobby** 上限 60 秒 —— 只夠 `budget` / `balanced` 單次分析。要開 `max` 或多次共識，要升 Pro（可去到 300 秒）。
- **Cloudflare Workers** 唔適合（CPU 時間限制），用 Node runtime 嘅平台（Vercel / Railway / Fly.io / 自建）。
- 公開部署前記得加 rate limiting —— 冇嘅話，一個 script 就可以幫你燒好多 API 額度。

---

## 已知限制

- 側面相會提升下顎線同輪廓判斷，但客人好多時只影正面 —— 系統會照跑，唔會夾硬估睇唔到嘅嘢
- 療程價格係 2025–2026 市場公開參考區間，會過時，建議每半年 review 一次
- 未做用戶帳戶、療程紀錄、前後對比 —— 需要嘅話要另外加資料庫同私隱處理
- 未做 rate limiting；公開部署前建議加（例如 Vercel middleware 或 Upstash）
