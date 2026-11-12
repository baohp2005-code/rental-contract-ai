import { z } from 'zod';

export const RULE_IDS = ['DEP-01', 'DEP-02', 'DEP-03', 'UTL-01', 'RNT-01', 'REP-01', 'TRM-01', 'TRM-02'] as const;
export const termNames = ['rent_vnd', 'deposit_vnd', 'electricity_vnd_per_kwh', 'water', 'duration_months', 'notice_days'] as const;
export const pointSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export const lineSchema = z.object({ id: z.string(), page_id: z.string(), raw_text: z.string(), polygon: z.array(pointSchema).length(4) });
export const pageSchema = z.object({ id: z.string(), width: z.number().int().positive(), height: z.number().int().positive(), lines: z.array(lineSchema) });
export const termSchema = z.object({
  value: z.union([z.number(), z.string(), z.null()]), unit: z.string(), raw_text: z.string(),
  line_ids: z.array(z.string()), status: z.enum(['found', 'not_found', 'unclear']),
});
export const keyTermsSchema = z.object({
  rent_vnd: termSchema, deposit_vnd: termSchema, electricity_vnd_per_kwh: termSchema,
  water: termSchema, duration_months: termSchema, notice_days: termSchema,
});
export const extractionSchema = z.object({
  lines: z.array(z.object({ line_id: z.string(), corrected_text: z.string() })),
  key_terms: keyTermsSchema,
});
export const flagSchema = z.object({
  id: z.string(), rule_id: z.enum(RULE_IDS), type: z.enum(['risky', 'missing', 'unclear']),
  severity: z.enum(['high', 'medium', 'low']), line_ids: z.array(z.string()), quote: z.string(),
  title: z.string(), explanation: z.string(), question_for_landlord: z.string(),
});
export const riskSchema = z.object({ flags: z.array(flagSchema) });
export const checkedFlagSchema = flagSchema.extend({ evidence_status: z.enum(['verified', 'needs_review', 'not_applicable']), evidence_reason: z.string() });
export const analyzeResponseSchema = z.object({
  analysis_id: z.string(), mode: z.enum(['replay', 'live']), sample_id: z.string().nullable(),
  pages: z.array(pageSchema), extraction: extractionSchema, flags: z.array(checkedFlagSchema),
  warnings: z.array(z.string()), calculations: z.object({ deposit_months: z.number().nullable() }),
  metadata: z.object({ model: z.string(), prompt_version: z.string(), checklist_version: z.string(), elapsed_ms: z.number(), input_tokens: z.number(), output_tokens: z.number() }),
});
export const messageRequestSchema = z.object({
  reviewed_flags: z.array(z.object({ id: z.string().min(1), keep: z.boolean(), question: z.string().trim().min(1).max(1000) })).max(20),
  address: z.enum(['em-anh-chi', 'chau-co-chu']), tone: z.enum(['gentle', 'direct']),
}).superRefine((value, ctx) => {
  if (new Set(value.reviewed_flags.map(f => f.id)).size !== value.reviewed_flags.length) ctx.addIssue({ code: 'custom', message: 'Mã cảnh báo bị lặp.' });
});
export const messageResponseSchema = z.object({ source: z.literal('template'), message: z.string(), questions: z.array(z.string()) });
export type Page = z.infer<typeof pageSchema>;
export type Extraction = z.infer<typeof extractionSchema>;
export type Flag = z.infer<typeof flagSchema>;
export type CheckedFlag = z.infer<typeof checkedFlagSchema>;
export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;
export type MessageRequest = z.infer<typeof messageRequestSchema>;

const normalize = (text: string) => text.normalize('NFC').replace(/\s+/gu, ' ').trim();

export function parseNumericTerm(raw: string): number | null {
  if (/-\s*\d/u.test(raw)) return null;
  const match = raw.toLowerCase().match(/(\d+(?:[.,]\d+)*)\s*(triệu|tr|nghìn|ngàn|k)?\s*(\d+)?/u);
  if (!match) return null;
  const literal = match[1];
  const number = /^(\d{1,3})([.,]\d{3})+$/u.test(literal) ? Number(literal.replace(/[.,]/gu,'')) : Number(literal.replace(',','.'));
  const scale = match[2] === 'triệu' || match[2] === 'tr' ? 1_000_000 : match[2] ? 1_000 : 1;
  const fraction = match[2] && match[3] ? Number(`0.${match[3]}`)*scale : 0;
  return Number.isFinite(number) ? Math.round(number*scale + fraction) : null;
}

export function validateAnalysis(pages: Page[], extraction: Extraction, flags: Flag[], allPagesConfirmed: boolean) {
  const warnings: string[] = [];
  const originals = new Map(pages.flatMap(p => p.lines.map(line => [line.id, line] as const)));
  const corrected = new Map(extraction.lines.map(line => [line.line_id, line.corrected_text]));
  if (corrected.size !== extraction.lines.length || corrected.size !== originals.size || [...corrected.keys()].some(id => !originals.has(id))) {
    throw new Error('EXTRACTION_LINE_MISMATCH');
  }
  const safeExtraction = extractionSchema.parse(structuredClone(extraction));
  const invalidTermIds = new Set<string>();
  for (const key of termNames) {
    const term = safeExtraction.key_terms[key];
    const text = term.line_ids.map(id => corrected.get(id) ?? '').join(' ');
    const originalText = term.line_ids.map(id => originals.get(id)?.raw_text ?? '').join(' ');
    const numeric = key !== 'water';
    const digits = (s: string) => s.match(/\d+/gu)?.join('|') ?? '';
    if (term.status === 'not_found') { term.value = null; continue; }
    const valid = term.line_ids.length > 0 && term.line_ids.every(id => originals.has(id))
      && normalize(term.raw_text).length > 0 && normalize(text).includes(normalize(term.raw_text))
      && (!numeric || (typeof term.value === 'number' && Number.isFinite(term.value) && term.value >= 0 && Number.isInteger(term.value)))
      && (!numeric || parseNumericTerm(term.raw_text) === term.value)
      && (numeric || typeof term.value === 'string')
      && digits(originalText) === digits(text);
    if (!valid || term.status === 'unclear') {
      term.status = 'unclear'; term.value = null;
      term.line_ids.forEach(id => invalidTermIds.add(id));
      warnings.push(`Cần kiểm tra lại trường ${key}; chưa dùng giá trị này để tính toán.`);
    }
  }
  const unreadable = extraction.lines.some(l => l.corrected_text.includes('[không đọc được]'));
  const seen = new Set<string>();
  const checked: CheckedFlag[] = [];
  for (const flag of flags) {
    const dedup = `${flag.rule_id}:${flag.type}:${[...flag.line_ids].sort().join(',')}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    let evidence_status: CheckedFlag['evidence_status'] = 'verified';
    let evidence_reason = 'Mã dòng và câu trích khớp OCR gốc; vẫn cần đọc lại trên ảnh.';
    if (flag.type === 'missing') {
      evidence_status = allPagesConfirmed && !unreadable && flag.line_ids.length === 0 && flag.quote.trim() === '' ? 'not_applicable' : 'needs_review';
      evidence_reason = evidence_status === 'not_applicable' ? 'Đã xác nhận đủ trang; đây là nhận định của AI về điều khoản thiếu.' : 'Chưa đủ dữ liệu đọc rõ để kết luận thiếu điều khoản.';
    } else {
      const source = flag.line_ids.map(id => originals.get(id)?.raw_text ?? '').join(' ');
      const revised = flag.line_ids.map(id => corrected.get(id) ?? '').join(' ');
      const valid = flag.line_ids.length > 0 && new Set(flag.line_ids).size === flag.line_ids.length
        && flag.line_ids.every(id => originals.has(id)) && normalize(flag.quote).length > 0
        && normalize(source).includes(normalize(flag.quote)) && normalize(revised).includes(normalize(flag.quote))
        && !flag.line_ids.some(id => invalidTermIds.has(id)) && !source.includes('[không đọc được]');
      if (!valid) { evidence_status = 'needs_review'; evidence_reason = 'Câu trích chưa khớp OCR gốc hoặc dữ liệu liên quan chưa chắc chắn; không tô vùng như bằng chứng đã xác minh.'; }
    }
    checked.push({ ...flag, id: `F${checked.length + 1}`, evidence_status, evidence_reason });
  }
  if (!allPagesConfirmed) warnings.push('Chưa xác nhận đủ trang/phụ lục; các nhận định thiếu điều khoản cần kiểm tra lại.');
  if (checked.some(f => f.evidence_status === 'needs_review')) warnings.push('Có cảnh báo chưa xác minh được bằng chứng.');
  const rent = safeExtraction.key_terms.rent_vnd.value;
  const deposit = safeExtraction.key_terms.deposit_vnd.value;
  const deposit_months = typeof rent === 'number' && rent > 0 && typeof deposit === 'number' ? Math.round(deposit / rent * 100) / 100 : null;
  return { extraction: safeExtraction, flags: checked, warnings, calculations: { deposit_months } };
}

export function composeMessage(input: MessageRequest) {
  const parsed = messageRequestSchema.parse(input);
  const questions = parsed.reviewed_flags.filter(f => f.keep).map(f => f.question);
  if (!questions.length) return { source: 'template' as const, message: '', questions };
  const subject = parsed.address === 'em-anh-chi' ? 'Em' : 'Cháu';
  const recipient = parsed.address === 'em-anh-chi' ? 'anh/chị' : 'cô/chú';
  const opening = parsed.tone === 'gentle' ? `${subject} chào ${recipient}, trước khi ký hợp đồng ${subject.toLowerCase()} muốn hỏi rõ một số điểm ạ:` : `${subject} muốn làm rõ các điểm sau trước khi ký hợp đồng:`;
  return { source: 'template' as const, questions, message: `${opening}\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n${subject} cảm ơn ${recipient} ạ.` };
}
