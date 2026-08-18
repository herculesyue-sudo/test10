# 上線：由本機到客人用得到

呢個工具而家淨係喺你部電腦行到。客人用唔到 —— **要放上網先算數**。

以下用 Vercel（免費額度夠一間診所用），大約 15 分鐘。

---

## 1. 開個 Anthropic API key

1. 去 <https://console.anthropic.com>，登記
2. **Billing → 入錢**（最少 US$5，夠試幾千次）
3. **Billing → Usage limits → 設一個每月上限**

> ⚠️ 第 3 步唔好跳。呢個係你嘅**最後一道保險**：就算 app 出 bug、就算限流
> 失效，Anthropic 到咗上限就會停，唔會出現一張你冇預算嘅帳單。
> 建議由 US$20 開始。

4. **API Keys → Create Key**，copy 低（佢只顯示一次）

---

## 2. 放上 Vercel

```bash
npm i -g vercel
vercel login
vercel --prod
```

第一次會問幾條問題，全部照預設撳 Enter 就得。

完成之後你會攞到一條網址，例如 `https://faceconsult-hk.vercel.app`。

---

## 3. 設定環境變數

喺 Vercel 網站 → 你個 project → **Settings → Environment Variables**，加：

| 變數 | 值 | 唔設會點 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 頭先 copy 嗰個 | 分析會失敗 |
| `NEXT_PUBLIC_CLINIC_NAME` | `Dr Timeless` | 顯示預設名 |
| `NEXT_PUBLIC_WHATSAPP` | `852xxxxxxxx` | **冇預約掣 —— 個工具就冇咗轉化出口** |
| `NEXT_PUBLIC_SITE_URL` | 你條 Vercel 網址 | 分享出去冇預覽卡 |
| `STAFF_TOKEN` | 自己諗一個長密碼 | `/pro`、`/share` 會鎖死（403） |
| `FUNNEL_TOKEN` | 另一個長隨機字串 | 睇唔到轉化數字 |
| `RATE_LIMIT_DAILY_TOTAL` | `300` | 用預設 500 |

**唔好設** `DEMO_MODE` —— 設咗客人就會見到示範假數據。

加完之後**一定要重新部署**先生效：

```bash
vercel --prod
```

> `NEXT_PUBLIC_*` 開頭嘅係 build 時寫死入前端嘅，改完唔重新部署一定唔會生效。

---

## 4. 自己行一次先俾客人

用**手機**（唔好用電腦）開你條網址，完整行一次：

- [ ] 影到相（影唔到 → 檢查網址係咪 `https://`）
- [ ] 太暗 / 太矇嘅相會俾提示叫你重影
- [ ] 出到報告，療程係你哋真係有嘅
- [ ] 報告**冇** 🧪 測試模式橫額
- [ ] 撳「WhatsApp 預約」→ 開到你哋個號碼，訊息預填咗
- [ ] 開 `你條網址/pro?k=你個STAFF_TOKEN` → 入得，之後 30 日唔使再輸
- [ ] 開 `你條網址/pro`（用另一部冇登入嘅機）→ 應該 401

---

## 5. 派俾客人

開 `你條網址/share?k=你個STAFF_TOKEN`，嗰版有：

- **QR 海報** —— 撳一下印出嚟，擺接待處 / 等候區
- **WhatsApp 文案** —— 已經寫好，copy 就 send 得
- **IG 貼文文字** —— 已經寫好

唔使改官網。

---

## 之後點睇成效

```
你條網址/api/track?token=你個FUNNEL_TOKEN
```

會見到每一步跌幾多人：

```
開啟頁面 → 影咗相 → 揀咗目標 → 同意條款 → 開始分析 → 收到報告 → 撳預約
```

邊一步跌最多人，就係下一步應該改嘅嘢：

| 跌喺邊 | 多數係咩問題 |
|---|---|
| 到咗但冇影相 | 文案唔夠吸引，或者同意條款嚇親人 |
| 影咗相冇分析 | 揀目標嗰步太煩 |
| 收到報告冇預約 | 報告唔夠說服力，或者 CTA 唔夠明顯 |

---

## 成本預期

MVP（`/`）固定行最平模式，**約 HK$0.05 一次**。

| 一個月用量 | 大約成本 |
|---|---|
| 200 次 | HK$10 |
| 1,000 次 | HK$50 |
| 5,000 次 | HK$250 |

三重保護：`RATE_LIMIT_PER_IP`（每個 IP 每個鐘）、`RATE_LIMIT_DAILY_TOTAL`
（全站每日，最壞情況嘅硬上限）、Anthropic console 嘅每月上限（最後一道）。

Vercel 免費額度對呢個用量係夠嘅。要留意嘅係 **Hobby 方案 function 上限 60 秒** ——
夠 MVP 用（最平模式一次約 20–30 秒），但 `/pro` 開 `max` 模式或者多次共識就
要升 Pro（300 秒）。
