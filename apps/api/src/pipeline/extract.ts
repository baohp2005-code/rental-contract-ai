/**
 * B2 · LLM đọc ảnh + dòng OCR: sửa lỗi OCR và trích key_terms.
 */
import { KeyTermsSchema, type KeyTerms, type OcrLine } from '@rental/shared';

import type { Llm, UserContent } from '../llm/types';
import { findMoney, sameDigits } from './numbers';
import { ExtractOutSchema } from './schemas';

/** Các trường là số tiền: giá trị phải đọc được từ chữ trên dòng trích dẫn. */
const MONEY_TERMS = new Set(['rent_vnd', 'deposit_vnd', 'electricity_vnd_per_kwh', 'water_vnd', 'service_fee_vnd']);

export type PageImage = { data: Buffer; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' };

export type ExtractResult = {
  isRentalContract: boolean;
  unreadablePages: number[];
  /** Dòng OCR sau khi sửa, giữ nguyên id, thứ tự và bbox. */
  lines: OcrLine[];
  keyTerms: KeyTerms;
};

export function formatLines(lines: OcrLine[]): string {
  return lines.map((l) => `[${l.id}] ${l.text}`).join('\n');
}

export async function extract(
  llm: Llm,
  system: string,
  images: PageImage[],
  ocrLines: OcrLine[],
): Promise<ExtractResult> {
  const content: UserContent = [];
  images.forEach((img, i) => {
    content.push({ type: 'text', text: `Trang ${i + 1}:` });
    content.push({ type: 'image', mediaType: img.mediaType, base64: img.data.toString('base64') });
  });
  content.push({ type: 'text', text: `<ocr_lines>\n${formatLines(ocrLines)}\n</ocr_lines>` });

  const out = await llm.structured({
    step: 'B2',
    system,
    content,
    schema: ExtractOutSchema,
    maxTokens: 16000,
  });

  return applyExtract(out, ocrLines, images.length);
}

/**
 * Trang mà AI phải "sửa con số" ở quá nhiều dòng: OCR đọc sai số liệu (thường
 * là chữ viết tay hoặc ảnh mờ). Phân tích tiếp trên trang đó dễ ra kết quả sai
 * hoặc "0 cảnh báo" khiến sinh viên tưởng hợp đồng an toàn, nên báo chụp lại.
 */
export const HARD_TO_READ = { minRejected: 4, minRatio: 0.2 };

export function hardToReadPages(ocrLines: OcrLine[], rejectedIds: string[]): number[] {
  const linesPerPage = new Map<number, number>();
  for (const l of ocrLines) linesPerPage.set(l.page, (linesPerPage.get(l.page) ?? 0) + 1);
  const pageOf = new Map(ocrLines.map((l) => [l.id, l.page]));
  const rejectedPerPage = new Map<number, number>();
  for (const id of rejectedIds) {
    const page = pageOf.get(id);
    if (page != null) rejectedPerPage.set(page, (rejectedPerPage.get(page) ?? 0) + 1);
  }
  return [...rejectedPerPage]
    .filter(([page, n]) => n >= HARD_TO_READ.minRejected && n / (linesPerPage.get(page) ?? 1) >= HARD_TO_READ.minRatio)
    .map(([page]) => page);
}

const formatVnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;

/** Phần xử lý thuần sau khi LLM trả lời (tách riêng để test). */
export function applyExtract(
  out: import('./schemas').ExtractOut,
  ocrLines: OcrLine[],
  pageCount: number,
): ExtractResult {
  const ocrById = new Map(ocrLines.map((l) => [l.id, l.text]));
  const known = new Set(ocrById.keys());
  const fixes = new Map<string, string>();
  const rejected: string[] = [];
  for (const c of out.corrections) {
    const text = c.text.replace(/\s+/g, ' ').trim();
    // Bỏ sửa cho id không có thật: model không được thêm hay gộp dòng.
    if (!known.has(c.id) || !text) continue;
    // Không cho AI đổi con số: "3.500.000" thành "5.500.000" là lỗi nặng nhất của app.
    // Chỉ nhận bản sửa khi các con số giữ nguyên (đã tính lỗi O/0, l/1 của OCR).
    if (!sameDigits(ocrById.get(c.id)!, text)) {
      // Không ghi nội dung dòng ra log: hợp đồng có tên, số điện thoại, CCCD.
      rejected.push(c.id);
      continue;
    }
    fixes.set(c.id, text);
  }
  if (rejected.length > 0) {
    console.warn(`[B2] bỏ ${rejected.length} bản sửa làm đổi con số: ${rejected.join(', ')}`);
  }
  const lines = ocrLines.map((l) => (fixes.has(l.id) ? { ...l, text: fixes.get(l.id)! } : l));
  const textById = new Map(lines.map((l) => [l.id, l.text]));

  // Bỏ line_ids không có thật; số không hợp lệ thì coi như "unclear".
  const terms = Object.fromEntries(
    Object.entries(out.key_terms).map(([key, t]) => {
      const lineIds = t.line_ids.filter((id) => known.has(id));
      let { value, status } = t;
      let rawText = t.raw_text;
      if (status !== 'found') value = null;
      if (status === 'found' && value == null) status = 'unclear';
      if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) {
        value = null;
        status = 'unclear';
      }
      // Số tiền AI trích ra phải thật sự có trên các dòng nó trích dẫn.
      if (status === 'found' && MONEY_TERMS.has(key) && typeof value === 'number') {
        const amounts = lineIds.flatMap((id) => findMoney(textById.get(id) ?? '').map((m) => m.value));
        if (!amounts.includes(value)) {
          console.warn(`[B2] ${key}: số AI đọc không có trên dòng ${lineIds.join(', ') || '(trống)'}, chuyển thành unclear`);
          // Giữ lại con số AI đọc từ ảnh để sinh viên tự kiểm tra, thay vì bỏ hẳn.
          rawText = `${formatVnd(value)} (AI đọc từ ảnh nhưng chữ trên ảnh khó đọc, hãy kiểm tra lại)`;
          value = null;
          status = 'unclear';
        }
      }
      return [key, { value, raw_text: rawText, line_ids: lineIds, status }];
    }),
  );

  return {
    isRentalContract: out.is_rental_contract,
    unreadablePages: [...new Set([...out.unreadable_pages, ...hardToReadPages(ocrLines, rejected)])]
      .filter((p) => Number.isInteger(p) && p >= 1 && p <= pageCount)
      .sort((a, b) => a - b),
    lines,
    keyTerms: KeyTermsSchema.parse(terms),
  };
}
