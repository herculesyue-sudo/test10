/**
 * 「AI 相片外觀年齡估算」功能開關 —— 獨立檔案係因為前端（結果頁）
 * 都要睇得到，而嗰邊唔入得 server-only 模組。
 *
 * ⚠️ 預設關閉。開之前要齊兩樣嘢：
 *    1. docs/age-estimate-validation.md 入面嘅驗證跑完兼達標
 *       （目標客群年齡／膚色／裝置覆蓋、重拍一致性、MAE 門檻）
 *    2. 合作醫生／法律顧問睇過展示文案
 *
 * server 用 AGE_ESTIMATE_ENABLED=1（wrangler vars）；前端用
 * NEXT_PUBLIC_AGE_ESTIMATE_ENABLED=1（build 時烘入 bundle）。
 * 兩個要一齊開先會出街；淨開一邊等於冇開。
 */
export const AGE_ESTIMATE_ENABLED = process.env.AGE_ESTIMATE_ENABLED === '1';

/** client bundle 用（NEXT_PUBLIC_ 喺 build 時 inline）。 */
export const AGE_ESTIMATE_PUBLIC = process.env.NEXT_PUBLIC_AGE_ESTIMATE_ENABLED === '1';
