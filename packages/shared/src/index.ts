/**
 * Hợp đồng dữ liệu giữa app (apps/mobile) và backend (apps/api).
 * Sửa file này = đổi API. Mở Pull Request và báo cả hai bên.
 */
import { z } from 'zod';

// ---------- Kiểu cơ bản ----------

export const SeveritySchema = z.enum(['high', 'medium', 'low']);
export type Severity = z.infer<typeof SeveritySchema>;

export const FlagTypeSchema = z.enum(['risky', 'missing', 'unclear']);
export type FlagType = z.infer<typeof FlagTypeSchema>;

export const CategorySchema = z.enum([
  'deposit',
  'utilities',
  'rent',
  'repairs',
  'termination',
  'other',
]);
export type Category = z.infer<typeof CategorySchema>;

/** Mã dòng OCR, ví dụ "p1-L12" = trang 1, dòng 12. */
export const LineIdSchema = z.string().regex(/^p\d+-L\d+$/);
export type LineId = z.infer<typeof LineIdSchema>;

// ---------- OCR (B1) ----------

/**
 * Vị trí dòng trên ảnh trang, CHUẨN HÓA về 0..1 theo chiều rộng/cao của ảnh
 * (x, y là góc trên-trái). App nhân với kích thước hiển thị để vẽ khung.
 */
export const BBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type BBox = z.infer<typeof BBoxSchema>;

export const OcrLineSchema = z.object({
  id: LineIdSchema,
  /** Số trang, bắt đầu từ 1, theo thứ tự ảnh gửi lên. */
  page: z.number().int().min(1),
  /** Chữ đã được LLM lần 1 sửa lỗi OCR. "[không đọc được]" nếu không đọc được. */
  text: z.string(),
  bbox: BBoxSchema,
});
export type OcrLine = z.infer<typeof OcrLineSchema>;

export const PageInfoSchema = z.object({
  page: z.number().int().min(1),
  /** Kích thước ảnh (px) mà backend đã dùng để tính bbox. */
  width: z.number().positive(),
  height: z.number().positive(),
});
export type PageInfo = z.infer<typeof PageInfoSchema>;

// ---------- Điều khoản chính (B2) ----------

export const TermStatusSchema = z.enum(['found', 'not_found', 'unclear']);
export type TermStatus = z.infer<typeof TermStatusSchema>;

const term = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    /** null khi status khác "found". */
    value: value.nullable(),
    /** Chữ nguyên văn trong hợp đồng, ví dụ "3tr5/tháng". */
    raw_text: z.string(),
    line_ids: z.array(LineIdSchema),
    status: TermStatusSchema,
  });

export const KeyTermsSchema = z.object({
  /** Tiền thuê mỗi tháng (VND). */
  rent_vnd: term(z.number()),
  /** Tiền cọc (VND). */
  deposit_vnd: term(z.number()),
  /** Giá điện (VND/số). */
  electricity_vnd_per_kwh: term(z.number()),
  /** Giá nước (VND), đơn vị tính ở water_unit. */
  water_vnd: term(z.number()),
  water_unit: term(z.enum(['per_person', 'per_m3'])),
  /** Phí dịch vụ mỗi tháng (VND). */
  service_fee_vnd: term(z.number()),
  /** Thời hạn hợp đồng (tháng). */
  term_months: term(z.number()),
  /** Số ngày phải báo trước khi chấm dứt. */
  notice_days: term(z.number()),
});
export type KeyTerms = z.infer<typeof KeyTermsSchema>;
export type KeyTermKey = keyof KeyTerms;
export type KeyTerm<T> = {
  value: T | null;
  raw_text: string;
  line_ids: LineId[];
  status: TermStatus;
};

// ---------- Các khoản phí khác (B2) ----------
// Danh sách mở: hợp đồng ghi khoản phí nào thì liệt kê khoản đó (wifi, gửi xe, rác...),
// không cố định số trường như key_terms.

export const FeeKindSchema = z.enum([
  'internet',
  'parking',
  'garbage',
  'cleaning',
  'elevator',
  'laundry',
  'management',
  'other',
]);
export type FeeKind = z.infer<typeof FeeKindSchema>;

/** Cách tính: mỗi tháng (cả phòng), mỗi người/tháng, mỗi xe/tháng, một lần. */
export const FeeUnitSchema = z.enum(['per_month', 'per_person', 'per_vehicle', 'one_time', 'other']);
export type FeeUnit = z.infer<typeof FeeUnitSchema>;

export const OtherFeeSchema = z.object({
  kind: FeeKindSchema,
  /** Tên khoản như hợp đồng gọi, ví dụ "Wifi", "Gửi xe máy". */
  name: z.string(),
  /** VND. 0 = miễn phí hoặc đã gồm trong tiền phòng. null khi status = "unclear". */
  value: z.number().nullable(),
  unit: FeeUnitSchema,
  raw_text: z.string(),
  line_ids: z.array(LineIdSchema),
  status: z.enum(['found', 'unclear']),
});
export type OtherFee = z.infer<typeof OtherFeeSchema>;

/** Tối đa số khoản phí khác trả về, để AI không liệt kê lan man. */
export const MAX_OTHER_FEES = 12;

// ---------- Cảnh báo (B3 + B4) ----------

export const FlagSchema = z.object({
  id: z.string(),
  /** Mã quy tắc trong data/checklist.yaml, ví dụ "DEP-02". */
  rule_id: z.string(),
  category: CategorySchema,
  type: FlagTypeSchema,
  severity: SeveritySchema,
  /** Rỗng khi type = "missing". */
  line_ids: z.array(LineIdSchema),
  /** Câu trích nguyên văn từ các dòng trên. Rỗng khi type = "missing". */
  quote: z.string(),
  title: z.string(),
  explanation: z.string(),
  /** Chỉ lấy từ data/market_norms.yaml. Chuỗi rỗng nếu chưa có dữ liệu. */
  what_is_common: z.string(),
  question_for_landlord: z.string(),
  /** Câu đề nghị ghi thêm/sửa trong hợp đồng. Có thể rỗng. */
  suggested_clause: z.string(),
  /** 0..1. Dưới LOW_CONFIDENCE thì app ghi "AI không chắc". */
  confidence: z.number().min(0).max(1),
});
export type Flag = z.infer<typeof FlagSchema>;

export const LOW_CONFIDENCE = 0.6;

// ---------- POST /analyze ----------

export const AnalyzeResponseSchema = z.object({
  contract_id: z.string(),
  pages: z.array(PageInfoSchema),
  lines: z.array(OcrLineSchema),
  key_terms: KeyTermsSchema,
  /** Các khoản phí ngoài key_terms. Backend cũ không gửi thì coi như rỗng. */
  other_fees: z.array(OtherFeeSchema).default([]),
  flags: z.array(FlagSchema),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

// ---------- POST /message (B5) ----------

/** Cách xưng hô với chủ nhà. */
export const AddressingSchema = z.enum(['em-anhchi', 'chau-cochu']);
export type Addressing = z.infer<typeof AddressingSchema>;

export const ToneSchema = z.enum(['gentle', 'direct']);
export type Tone = z.infer<typeof ToneSchema>;

/** Một cảnh báo sinh viên đã GIỮ, kèm câu hỏi họ đã sửa (nếu có). */
export const KeptFlagSchema = z.object({
  id: z.string(),
  rule_id: z.string(),
  title: z.string(),
  quote: z.string(),
  question_for_landlord: z.string(),
  suggested_clause: z.string(),
});
export type KeptFlag = z.infer<typeof KeptFlagSchema>;

export const MessageRequestSchema = z.object({
  contract_id: z.string(),
  flags: z.array(KeptFlagSchema).min(1),
  addressing: AddressingSchema,
  tone: ToneSchema,
});
export type MessageRequest = z.infer<typeof MessageRequestSchema>;

export const MessageResponseSchema = z.object({
  /** Tin nhắn Zalo ngắn, gửi được ngay. */
  message: z.string(),
  /** Danh sách câu hỏi đánh số. */
  questions: z.array(z.string()),
  /** Các câu đề nghị ghi thêm vào hợp đồng. */
  suggested_clauses: z.array(z.string()),
});
export type MessageResponse = z.infer<typeof MessageResponseSchema>;

// ---------- Lỗi ----------

export const ApiErrorSchema = z.object({
  error: z.object({
    /** image_unreadable: ảnh quá mờ/không phải hợp đồng → app mời chụp lại. */
    code: z.enum(['image_unreadable', 'not_a_contract', 'too_many_pages', 'internal']),
    message: z.string(),
    /** Trang cần chụp lại (nếu biết). */
    pages: z.array(z.number().int()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const MAX_PAGES = 8;
