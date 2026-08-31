/**
 * Google Vertex AI（Gemini）通道。
 *
 * 點解有呢個檔案：Anthropic 全線唔支援香港（anthropic.com/supported-countries
 * 冇香港，console／Claude Platform on AWS／Bedrock 逐個實測都封，見 DEPLOY.md），
 * 而 Google 嘅企業通道 Vertex AI 香港公司用到（消費版 Gemini app 同
 * AI Studio 直連 API 就一樣封港，唔好搞錯邊）。
 *
 * 設計對齊 anthropic.ts 嘅 Bedrock 分支：JSON Schema 附入 prompt、
 * 收到後本地 Zod 驗證，落到 postProcess 嘅嘢同 Claude 版一樣嚴格。
 *
 * 認證：Vertex 唔收簡單 API key，要 service account。Workers 冇 Google SDK
 * 都簽到 —— 用 WebCrypto RS256 簽 JWT 再去 oauth2.googleapis.com 換
 * access token，快取 55 分鐘。
 */
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AnalysisSchema } from './schema';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { postProcess, usabilityVerdict } from './postprocess';
import { USD_TO_HKD, type AnalyzeOptions, type AnalyzeResult, type Tier } from './anthropic';

/** 設咗 GCP project 就行 Vertex 通道（優先過 Bedrock／直連）。 */
export const geminiMode = () => !!process.env.GEMINI_VERTEX_PROJECT;

/**
 * 三個層級對應嘅 Gemini model（2026-08 現役型號；價錢係美元／百萬 token，
 * 只係俾報告底部成本顯示用，唔影響實際收費）。
 * max 層同 balanced 同一隻 model，分別在 deepThinking（thinkingLevel: high）。
 */
const VERTEX_TIERS: Record<
  Tier,
  { model: string; usdPerMTok: { input: number; output: number }; maxTokens: number; deepThinking?: boolean }
> = {
  budget: { model: 'gemini-3.7-flash', usdPerMTok: { input: 0.75, output: 3.75 }, maxTokens: 8000 },
  balanced: { model: 'gemini-3.1-pro-preview', usdPerMTok: { input: 2, output: 12 }, maxTokens: 16000 },
  max: { model: 'gemini-3.1-pro-preview', usdPerMTok: { input: 2, output: 12 }, maxTokens: 24000, deepThinking: true },
};

// ── Service account → access token ──

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let _token: { value: string; expiresAt: number } | null = null;

function b64url(bytes: Uint8Array | string): string {
  const buf = typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes);
  return buf.toString('base64url');
}

async function accessToken(): Promise<string> {
  if (_token && Date.now() < _token.expiresAt - 5 * 60_000) return _token.value;

  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('未設定 GCP_SERVICE_ACCOUNT_JSON。請將 service account 個 JSON key 成個 secret put 入去。');
  }
  const sa = JSON.parse(raw) as ServiceAccount;

  const iat = Math.floor(Date.now() / 1000);
  const unsigned =
    b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) +
    '.' +
    b64url(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        aud: 'https://oauth2.googleapis.com/token',
        iat,
        exp: iat + 3600,
      }),
    );

  const der = Buffer.from(sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  if (!res.ok) {
    throw Object.assign(new Error(`GCP token 交換失敗：${res.status} ${(await res.text()).slice(0, 300)}`), {
      status: res.status,
    });
  }
  const j = (await res.json()) as { access_token: string; expires_in: number };
  _token = { value: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

// ── generateContent ──

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}

/** 單次分析（Vertex 版）。同 anthropic.ts 嘅 analyzeOnce 回傳完全同構。 */
export async function analyzeOnceGemini(opts: AnalyzeOptions): Promise<AnalyzeResult> {
  const cfg = VERTEX_TIERS[opts.tier];
  const project = process.env.GEMINI_VERTEX_PROJECT!;
  const location = process.env.GEMINI_VERTEX_LOCATION || 'global';
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${cfg.model}:generateContent`;

  const parts: Record<string, unknown>[] = [];
  for (const img of opts.images) {
    parts.push({ text: `【${img.angle}】` });
    parts.push({ inlineData: { mimeType: img.mediaType, data: img.data } });
  }
  parts.push({
    text:
      buildUserPrompt({ goals: opts.goals, notes: opts.notes, age: opts.age, gender: opts.gender }) +
      '\n\n輸出要求：只輸出一個符合以下 JSON Schema 嘅 JSON object。' +
      '唔好用 markdown code fence，唔好喺 JSON 前後加任何文字。\n' +
      JSON.stringify(zodOutputFormat(AnalysisSchema).schema),
  });

  const token = await accessToken();
  const call = (withThinking: boolean) =>
    fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          maxOutputTokens: cfg.maxTokens,
          responseMimeType: 'application/json',
          ...(withThinking ? { thinkingConfig: { thinkingLevel: 'high' } } : {}),
        },
      }),
    });

  let res = await call(!!cfg.deepThinking);
  if (!res.ok && cfg.deepThinking && res.status === 400) {
    // thinkingLevel 欄位隨 model 世代變動 —— 唔受落就退一步照行，唔好成個分析死掉。
    const errText = await res.text();
    if (/thinking/i.test(errText)) {
      res = await call(false);
    } else {
      throw Object.assign(new Error(`400 ${errText.slice(0, 400)}`), { status: 400 });
    }
  }
  if (!res.ok) {
    throw Object.assign(new Error(`${res.status} ${(await res.text()).slice(0, 400)}`), { status: res.status });
  }

  const j = (await res.json()) as GeminiResponse;
  const cand = j.candidates?.[0];
  if (!cand || j.promptFeedback?.blockReason || cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT') {
    throw new Error('模型基於安全政策拒絕處理呢張相。請確認相片內容並重試。');
  }

  const text = (cand.content?.parts ?? []).map((p) => p.text ?? '').join('');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('模型輸出未能解析成預期格式，請重試。');
  }
  let output;
  try {
    output = AnalysisSchema.parse(JSON.parse(text.slice(start, end + 1)));
  } catch {
    throw new Error('模型輸出未能解析成預期格式，請重試。');
  }

  const u = j.usageMetadata ?? {};
  const inTok = u.promptTokenCount ?? 0;
  // thinking token 照 output 價計費
  const outTok = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);

  const { analysis, adjustments } = postProcess(output);

  return {
    analysis,
    adjustments,
    usage: { inputTokens: inTok, outputTokens: outTok },
    costHKD: ((inTok / 1e6) * cfg.usdPerMTok.input + (outTok / 1e6) * cfg.usdPerMTok.output) * USD_TO_HKD,
    model: cfg.model,
    passes: 1,
    usability: usabilityVerdict(analysis),
  };
}
