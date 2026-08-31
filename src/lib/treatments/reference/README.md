# reference/ — 市場通用療程資料（**唔會出現喺推薦入面**）

呢個資料夾入面 36 個療程係香港市場嘅通用參考資料，**冇駁入配對引擎**，
唔會出現喺任何客人見到嘅推薦入面。

## 點解要隔離？

推薦一個診所冇提供嘅療程，比冇推薦更差 —— 等於用你自己嘅工具幫客人搵競爭對手。
所以引擎只讀 `../clinic.ts`（診所實際提供嘅），呢度嘅嘢淨係做**複製模板**。

## 點用？

要加一個新療程入診所目錄嗰陣，喺呢度搵返類似嘅一條，複製去 `../clinic.ts`，
再改返：

- `id` / `name` / `brand` — 改成你診所嘅叫法
- `priceHKD` + `priceStatus: 'confirmed'` — **一定要用診所真實價錢**
- `sessions` / `interval` — 你診所嘅實際安排
- `indications` — 通常可以照抄（呢啲係臨床適應症，唔係診所特定）
- `mechanism` / `contraindications` / `regulation` — 通常可以照抄

## ⚠️ 唔好直接 import

`src/lib/treatments/index.ts` 刻意冇 import 呢個資料夾。
如果你 import 咗，客人就會見到你診所做唔到嘅療程。
