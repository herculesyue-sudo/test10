/**
 * 每電話免費分析額度 —— 獨立檔案係因為前端（ContactCard）都要顯示呢個數，
 * 而 phone-quota.ts 用咗 node:crypto，唔入得 client bundle。
 */
export const FREE_ANALYSES_PER_PHONE = 3;
