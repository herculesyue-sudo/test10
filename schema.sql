-- 客人分析紀錄（冇相片、冇自由文字觀察 —— 只有評分同 key/severity/confidence）
-- 起 D1：npx wrangler d1 create drtimeless-visits
-- 行 migration：npx wrangler d1 execute drtimeless-visits --remote --file=./schema.sql
-- （visits-d1.ts 第一次用嗰陣都會自動行同一段 DDL，呢份係俾人手行 / 對照用）
CREATE TABLE IF NOT EXISTS visits (
  id              TEXT PRIMARY KEY,
  phone           TEXT NOT NULL,             -- 已標準化嘅 8 位香港號碼
  created_at      TEXT NOT NULL,             -- ISO 8601 UTC
  source          TEXT NOT NULL CHECK (source IN ('customer','pro')),
  age_band        TEXT,
  goals           TEXT NOT NULL DEFAULT '[]',  -- JSON array
  category_scores TEXT NOT NULL,               -- JSON: [{key,score,lowConfidence} x8]
  findings        TEXT NOT NULL                -- JSON: [{key,severity,confidence}]
);
CREATE INDEX IF NOT EXISTS idx_visits_phone ON visits (phone, created_at DESC);

-- 每電話免費分析額度（phone-quota.ts 會喺首次使用時自動建表，呢份係人手行／對照用）
-- phone_key 係 HMAC-SHA256(電話, FUNNEL_TOKEN) —— 唔儲原始號碼
CREATE TABLE IF NOT EXISTS phone_quota (
  phone_key  TEXT PRIMARY KEY,
  used       INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 跟進名單（leads.ts 自動建表，呢份係對照用）
-- 客人剔咗「同意保存＋WhatsApp 跟進」先會有一行；PDPO 刪除同 visits 一齊刪
CREATE TABLE IF NOT EXISTS leads (
  id           TEXT PRIMARY KEY,
  phone        TEXT NOT NULL,
  name         TEXT,
  created_at   TEXT NOT NULL,
  goals        TEXT NOT NULL DEFAULT '[]',
  top_findings TEXT NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'new',
  source       TEXT NOT NULL DEFAULT 'customer'
);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads (phone);

-- 每月 AI 使費計量（ai-budget.ts 自動建表，呢份係對照用）
-- 每次真實分析按回傳 token 數累加；月 key = UTC YYYY-MM
CREATE TABLE IF NOT EXISTS ai_spend (
  month         TEXT PRIMARY KEY,
  cost_hkd      REAL NOT NULL DEFAULT 0,
  analyses      INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL
);
