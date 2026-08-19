# 上線

## ☁️ 部署去 Cloudflare（你個網域已經喺嗰度）

drtimeless.com 本身已經喺 Cloudflare（帳戶入面有 `drtimeless-claim-api`
worker），所以部署去 Cloudflare 最順：同一個 dashboard、同一張帳單，
仲可以直接掛個 subdomain，唔使搞跨供應商 DNS。

專案已經配置好晒（`wrangler.jsonc` + `open-next.config.ts`），
喺你部電腦行：

```bash
npm install
npx wrangler login      # 會開瀏覽器叫你登入，撳「Allow」
npm run cf:deploy
```

完成之後會俾你一條網址，例如
`https://drtimeless-ai-consult.<你嘅帳戶>.workers.dev`。

### ⚠️ Cloudflare 嘅環境變數同 Vercel 唔同

**`.env` 喺 Workers 上面冇效。** 唔知呢樣就會出現「明明填咗但唔 work」。

**秘密（唔可以俾人睇）** —— 用 `wrangler secret`：

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put STAFF_TOKEN
npx wrangler secret put FUNNEL_TOKEN
```

**非秘密** —— 加喺 `wrangler.jsonc` 個 `vars` 入面：

```jsonc
"vars": {
  "NEXT_PUBLIC_CLINIC_NAME": "Dr Timeless",
  "NEXT_PUBLIC_WHATSAPP": "852xxxxxxxx",
  "NEXT_PUBLIC_SITE_URL": "https://ai.drtimeless.com",
  "EMBED_ALLOWED_ORIGINS": "https://www.drtimeless.com,https://drtimeless.com",
  "RATE_LIMIT_DAILY_TOTAL": "300"
}
```

改完 `vars` 要再 `npm run cf:deploy` 先生效。

> `NEXT_PUBLIC_*` 係 **build 時**入到前端 bundle 嘅，所以佢哋一定要喺
> `vars`（build 讀得到），唔可以用 secret。

### 掛自己個 subdomain（建議）

Cloudflare dashboard → **Workers & Pages → 揀個 project →
Settings → Domains & Routes → Add → Custom Domain**，
填 `ai.drtimeless.com`。DNS 會自動加，因為個網域已經喺同一個帳戶。

之後條網址就係 `https://ai.drtimeless.com` —— 印海報、派連結、
嵌入官網都用呢條。

### 本機先試（唔會影響線上）

```bash
npm run cf:preview
```

呢個用真正嘅 Workers 執行環境（workerd）喺本機行，同線上一樣。
本機要設環境變數就開一個 `.dev.vars`（格式同 `.env` 一樣，
已經加咗入 `.gitignore`）。

### 費用

Workers 免費方案每日 10 萬個請求，對一間診所嚟講綽綽有餘。
但**免費方案 CPU 上限係 10ms**，唔夠用 —— 要 **Workers Paid（US$5/月）**
先有 30 秒 CPU。

> 等 Anthropic 回應嗰 20–30 秒**唔計 CPU 時間**（等 fetch 唔算 CPU），
> 所以真正用到嘅 CPU 主要係處理相片同 JSON，遠遠喺上限之內。

---

## 🅥 或者用 Vercel（如果你想分開）

### 撳個掣，唔使用 terminal

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fherculesyue-sudo%2Ftest10&env=ANTHROPIC_API_KEY%2CNEXT_PUBLIC_CLINIC_NAME%2CNEXT_PUBLIC_WHATSAPP%2CSTAFF_TOKEN%2CDEMO_MODE&envDescription=%E5%A1%AB%E6%B3%95%E8%A6%8B%20.env.example&envLink=https%3A%2F%2Fgithub.com%2Fherculesyue-sudo%2Ftest10%2Fblob%2Fmain%2F.env.example&project-name=drtimeless-ai-consult&repository-name=drtimeless-ai-consult)

撳完會叫你：登入 GitHub → 填幾個設定 → 等一兩分鐘 → 俾你一條網址。

**填設定嗰陣，最快嘅試法係只填 `DEMO_MODE` = `1`**，其餘留空。咁樣唔使
API key、零成本，即刻有條公開網址試到成個流程同個 QR。試完先返去
Vercel 嘅 Settings → Environment Variables 填返真嘢。

> ### ⚠️ 撳之前要做一件事
>
> 呢個掣係由 GitHub 個 **`main`** branch 部署嘅，但而家啲 code 喺
> **`claude/video-facial-analysis-ai-hiv912`** 度，`main` 淨係得個
> README —— 就咁撳會部署到一個空 app。
>
> 兩個做法揀一個：
>
> **(A) 先合併去 `main`**（之後撳個掣就一定啱）
> 喺 GitHub 開個 Pull Request 由 `claude/video-facial-analysis-ai-hiv912`
> merge 落 `main`，撳 Merge，然後先撳上面個掣。
>
> **(B) 部署完再改 branch**
> 照撳個掣部署，完成之後入 Vercel 個 project →
> **Settings → Git → Production Branch** → 改做
> `claude/video-facial-analysis-ai-hiv912` → 再去 **Deployments** 撳
> **Redeploy**。

部署好之後：

1. 開 `https://你條網址/share?k=你個STAFF_TOKEN`
   （`DEMO_MODE=1` 之下唔使 `?k=`）
2. 個列印掣會著返，QR 會指住你條真網址
3. 用手機掃嗰個 QR —— 呢次會開得到

---

## 🩺 掃唔到？行呢句

```bash
npm run doctor
```

會一次過查晒：設定、網絡位址、app 行緊未、個 QR 實際編碼緊咩網址、
隧道連唔連得通，然後出一份報告。**直接複製成份報告出嚟**，就唔使
逐句形容個問題。

---

## 想喺本機用手機試（唔部署）

```bash
npm run tunnel
```

會開一條臨時公開 https 網址。**開 `/share` 要用嗰條隧道網址，唔好用
localhost** —— 個 QR 係跟「你開緊邊條網址」砌嘅。

如果你間屋 / 診所嘅網絡封鎖咗 Cloudflare，呢句會失敗（`npm run doctor`
會話你知）。咁就直接用上面個 Deploy 掣。

---

## 正式部署（用 terminal 嘅話）

用 Vercel（免費額度夠一間診所用），大約 15 分鐘。

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
