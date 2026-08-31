/**
 * 跟進名單嘅型別同常量 —— 獨立檔案係因為前端（/records 頁）都要用，
 * 而 leads.ts 用咗 @opennextjs/cloudflare（ESM-only、server-only），
 * 唔入得 client bundle。同 quota-config.ts 一樣嘅拆法。
 */

export const LEAD_STATUSES = ['new', 'contacted', 'booked', 'no_interest'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: '新',
  contacted: '已聯絡',
  booked: '已預約',
  no_interest: '冇興趣',
};

export interface LeadRecord {
  id: string;
  /** 已標準化嘅 8 位手機號碼（客人同意先儲原文） */
  phone: string;
  name?: string;
  /** ISO 8601 UTC */
  createdAt: string;
  goals: string[];
  /** 嚴重度最高頭 3 項，俾職員一眼睇到跟進切入點 */
  topFindings: { key: string; severity: number }[];
  status: LeadStatus;
  source: 'customer' | 'pro';
}
