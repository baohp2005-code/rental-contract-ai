/**
 * Khuôn dữ liệu của data/checklist.yaml và data/market_norms.yaml.
 * Backend đọc file YAML rồi parse bằng các schema này; app không cần dùng.
 */
import { z } from 'zod';

import { CategorySchema, SeveritySchema } from './index';

export const ChecklistRuleSchema = z.object({
  id: z.string(),
  category: CategorySchema,
  severity: SeveritySchema,
  /** true = bước B3 kiểm tra bằng code từ key_terms. */
  auto: z.boolean(),
  description: z.string(),
  why: z.string(),
  question: z.string(),
  threshold: z.string().optional(),
  /** Căn cứ pháp lý kèm mức xác minh, ví dụ "Luật Nhà ở 2023 Đ172 k4 (VB gốc)". */
  legal_basis: z.string().optional(),
});
export type ChecklistRule = z.infer<typeof ChecklistRuleSchema>;

export const ChecklistSchema = z.object({
  rules: z.array(ChecklistRuleSchema).min(1),
  legal_refs: z.array(z.string()).optional(),
});
export type Checklist = z.infer<typeof ChecklistSchema>;

const num = z.number().nullable().optional();

export const MarketNormsSchema = z.object({
  source: z.string().nullable().optional(),
  deposit_months_typical: num,
  /** Ngưỡng cảnh báo DEP-04. null = chưa khảo sát, B3 bỏ qua quy tắc. */
  deposit_months_max: num,
  electricity_vnd_per_kwh_typical: num,
  /** Ngưỡng cảnh báo UTL-01. null = chưa khảo sát. */
  electricity_max: num,
  water: z
    .object({
      per_person_vnd_typical: num,
      per_m3_vnd_typical: num,
    })
    .nullable()
    .optional(),
  service_fee_vnd_typical: num,
  notice_days_typical: num,
});
export type MarketNorms = z.infer<typeof MarketNormsSchema>;
