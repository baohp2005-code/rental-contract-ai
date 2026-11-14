/**
 * Khuôn đầu ra ép cho LLM (structured outputs).
 *
 * Cố ý đơn giản hơn schema trong @rental/shared (không regex, không min/max)
 * vì structured outputs chỉ hỗ trợ một phần JSON Schema. Backend tự kiểm tra
 * chặt bằng schema chung sau khi nhận kết quả.
 */
import { z } from 'zod';

const termOut = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value.nullable(),
    raw_text: z.string(),
    line_ids: z.array(z.string()),
    status: z.enum(['found', 'not_found', 'unclear']),
  });

export const KeyTermsOutSchema = z.object({
  rent_vnd: termOut(z.number()),
  deposit_vnd: termOut(z.number()),
  electricity_vnd_per_kwh: termOut(z.number()),
  water_vnd: termOut(z.number()),
  water_unit: termOut(z.enum(['per_person', 'per_m3'])),
  service_fee_vnd: termOut(z.number()),
  term_months: termOut(z.number()),
  notice_days: termOut(z.number()),
});

/** Khoản phí khác (wifi, gửi xe...). Khuôn lỏng; backend kiểm tra lại bằng schema chung. */
export const OtherFeeOutSchema = z.object({
  kind: z.enum(['internet', 'parking', 'garbage', 'cleaning', 'elevator', 'laundry', 'management', 'other']),
  name: z.string(),
  value: z.number().nullable(),
  unit: z.enum(['per_month', 'per_person', 'per_vehicle', 'one_time', 'other']),
  raw_text: z.string(),
  line_ids: z.array(z.string()),
  status: z.enum(['found', 'unclear']),
});

/** B2 · Đọc & trích xuất. */
export const ExtractOutSchema = z.object({
  is_rental_contract: z.boolean(),
  /** Trang mà phần lớn nội dung không đọc được, cần chụp lại. */
  unreadable_pages: z.array(z.number()),
  /** Chỉ những dòng cần sửa so với OCR. */
  corrections: z.array(z.object({ id: z.string(), text: z.string() })),
  key_terms: KeyTermsOutSchema,
  /** Các khoản phí khác ngoài key_terms, hợp đồng ghi khoản nào thì liệt kê khoản đó. */
  other_fees: z.array(OtherFeeOutSchema),
});
export type ExtractOut = z.infer<typeof ExtractOutSchema>;

/** B2b · Đọc lại một trang khó đọc thẳng từ ảnh, theo đúng các id dòng OCR. */
export const RereadOutSchema = z.object({
  lines: z.array(z.object({ id: z.string(), text: z.string() })),
});
export type RereadOut = z.infer<typeof RereadOutSchema>;

/** B4 · Phân tích rủi ro. Backend tự gán id F1, F2... */
export const RiskOutSchema = z.object({
  flags: z.array(
    z.object({
      rule_id: z.string(),
      category: z.enum(['deposit', 'utilities', 'rent', 'repairs', 'termination', 'other']),
      type: z.enum(['risky', 'missing', 'unclear']),
      severity: z.enum(['high', 'medium', 'low']),
      line_ids: z.array(z.string()),
      quote: z.string(),
      title: z.string(),
      explanation: z.string(),
      what_is_common: z.string(),
      question_for_landlord: z.string(),
      suggested_clause: z.string(),
      confidence: z.number(),
    }),
  ),
});
export type RiskOut = z.infer<typeof RiskOutSchema>;

/** B5 · Soạn tin nhắn. */
export const MessageOutSchema = z.object({
  message: z.string(),
  questions: z.array(z.string()),
  suggested_clauses: z.array(z.string()),
});
