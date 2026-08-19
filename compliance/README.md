# 合規詞庫掃描器

發布前的強制關卡。掃描文案是否命中已知的違規用語規則，輸出位置、依據條文與改寫建議。

## 用法

```bash
# 掃描單一檔案（預設 all 市場，最嚴格）
python3 compliance/check.py drafts/post-001.md

# 只用香港規則
python3 compliance/check.py drafts/*.md --market hk

# 從 stdin 讀（快速檢查一句話）
echo "食完血糖降咗" | python3 compliance/check.py -

# 給自動化流程用
python3 compliance/check.py drafts/post-001.md --json

# 最終發布關卡：warn 也當作不通過
python3 compliance/check.py drafts/post-001.md --warn-as-block
```

## 退出碼

| 碼 | 意思 |
|---|---|
| 0 | 無 block 級發現 |
| 1 | 有 block 級發現 → **不得發布** |
| 2 | 用法或檔案錯誤 |

## 輸出範例

```
drafts/post-001.md
  BLOCK 2:36  「減針」  [DRUG-REDUCTION]
        真實案例：一位30歲患者3個月已經減針2度
        依據：誘導調整處方藥，最高危聲稱；可致低血糖或酮症酸中毒
        建議：刪除。統一改為：「任何藥物調整必須由你的主診醫生決定」
```

## 規則庫

規則在 [rules.json](rules.json)。每條規則：

| 欄位 | 說明 |
|---|---|
| `id` | 規則代號，出現在報告中 |
| `markets` | 適用市場：`hk` `cn` `us` |
| `severity` | `block`（不得發布）／`warn`（需人工判斷） |
| `pattern` | 正則表達式，大小寫不敏感 |
| `satisfied_by` | 選填。若整份文件含此內容則該規則不觸發（例如已附免責聲明） |
| `reason` | 法律依據 |
| `suggestion` | 改寫方向 |

新增規則直接改 JSON，不需改程式。改完跑一次現有草稿確認沒有大量誤報。

## 接入發布流程

```
AI 生成草稿
   ↓
check.py --market <目標>   ← 自動，不通過就打回
   ↓
指定人工簽核（記錄簽核人與日期）
   ↓
人手發布
```

小紅書內容必須用 `--market cn`；香港 FB／IG 用 `--market hk`；
如同一素材要跨市場使用，用預設的 `all`。

## 限制（請認真看待）

- 這是**關鍵字比對**，不是語意理解。改寫後的違規句（例如用比喻、諧音、圖片內文字）
  照樣可以通過掃描。
- 監管機構看的是**整體印象**，不是逐字對照。一篇每個詞都合格、
  但整體讀落去就係「呢隻嘢醫得好糖尿病」的貼文，一樣會出事。
- **掃描通過 ≠ 合規。** 它只代表沒有命中已知規則。人工簽核不可省。
- 圖片、影片內的文字與旁白不會被掃描，需另行人手檢查。
- 規則庫依據撰寫時的理解編寫，**須經執業律師覆核並定期更新**。
