/**
 * B2 · LLM đọc ảnh + dòng OCR: sửa lỗi OCR và trích key_terms.
 */
import { KeyTermsSchema, type KeyTerms, type OcrLine } from '@rental/shared';

import type { Llm, UserContent } from '../llm/types';
import { findMoney, sameDigits } from './numbers';
import { ExtractOutSchema, RereadOutSchema, type ExtractOut } from './schemas';

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
  rereadSystem?: string,
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

  // B2b · Trang khó đọc (chữ viết tay, ảnh mờ): cho AI đọc lại riêng từng trang
  // thẳng từ ảnh, rồi chỉ nhận con số khi hai lần đọc khớp nhau.
  let reread: Map<string, string> | undefined;
  if (rereadSystem) {
    const hard = hardToReadPages(ocrLines, reviewCorrections(out, ocrLines).uncertain).filter(
      (page) => page >= 1 && page <= images.length,
    );
    if (hard.length > 0) reread = await rereadPages(llm, rereadSystem, images, ocrLines, hard);
  }

  return applyExtract(out, ocrLines, images.length, reread);
}

/** Dòng OCR kèm vị trí theo chiều cao trang, để AI biết dòng nằm ở đâu trên ảnh. */
export function formatPageLines(lines: OcrLine[]): string {
  return lines
    .map((l) => `[${l.id}] (cao ${Math.round((l.bbox.y + l.bbox.h / 2) * 100)}%) ${l.text}`)
    .join('\n');
}

/**
 * Đọc lại các trang khó đọc, mỗi trang một lần gọi (chạy song song).
 * Lỗi khi đọc lại thì bỏ qua trang đó: trang vẫn bị báo khó đọc như trước.
 */
export async function rereadPages(
  llm: Llm,
  system: string,
  images: PageImage[],
  ocrLines: OcrLine[],
  pages: number[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  await Promise.all(
    pages.map(async (page) => {
      const img = images[page - 1];
      const pageLines = ocrLines.filter((l) => l.page === page);
      if (!img || pageLines.length === 0) return;
      try {
        const out = await llm.structured({
          step: `B2b·trang ${page}`,
          system,
          content: [
            { type: 'image', mediaType: img.mediaType, base64: img.data.toString('base64') },
            { type: 'text', text: `<ocr_lines>\n${formatPageLines(pageLines)}\n</ocr_lines>` },
          ],
          schema: RereadOutSchema,
          maxTokens: 8000,
        });
        const ids = new Set(pageLines.map((l) => l.id));
        for (const l of out.lines) {
          const text = l.text.replace(/\s+/g, ' ').trim();
          if (ids.has(l.id) && text) result.set(l.id, text);
        }
      } catch (err) {
        // Không ghi nội dung trang, chỉ ghi loại lỗi.
        const why = err instanceof Error ? `${err.name}: ${err.message.slice(0, 120)}` : 'lỗi không rõ';
        console.warn(`[B2b] trang ${page}: đọc lại thất bại (${why}), giữ báo khó đọc`);
      }
    }),
  );
  return result;
}

/**
 * Quyết định chữ cuối cùng của từng dòng.
 *
 * Không có bản đọc lại: nhận bản sửa của B2 chỉ khi con số giữ nguyên so với
 * OCR; đổi số thì giữ chữ OCR và đánh dấu dòng "chưa chắc".
 *
 * Có bản đọc lại (trang khó đọc): con số phải được hai trong ba lần đọc
 * (OCR, B2, đọc lại) đồng ý. Bản đọc lại khớp số với B2 hoặc với OCR thì nhận
 * bản đọc lại; lệch với cả hai thì dòng vẫn "chưa chắc".
 */
export function reviewCorrections(
  out: Pick<ExtractOut, 'corrections'>,
  ocrLines: OcrLine[],
  reread?: Map<string, string>,
): { fixes: Map<string, string>; uncertain: string[] } {
  const b2 = new Map<string, string>();
  for (const c of out.corrections) {
    const text = c.text.replace(/\s+/g, ' ').trim();
    if (text) b2.set(c.id, text);
  }
  const fixes = new Map<string, string>();
  const uncertain: string[] = [];
  for (const l of ocrLines) {
    const fromB2 = b2.get(l.id);
    const again = reread?.get(l.id);
    const b2KeepsDigits = fromB2 != null && sameDigits(l.text, fromB2);
    if (again != null) {
      if ((fromB2 != null && sameDigits(again, fromB2)) || sameDigits(again, l.text)) {
        fixes.set(l.id, again);
      } else {
        uncertain.push(l.id);
        if (b2KeepsDigits) fixes.set(l.id, fromB2!);
      }
      continue;
    }
    if (fromB2 == null) continue;
    if (b2KeepsDigits) fixes.set(l.id, fromB2);
    else uncertain.push(l.id);
  }
  return { fixes, uncertain };
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
  out: ExtractOut,
  ocrLines: OcrLine[],
  pageCount: number,
  reread?: Map<string, string>,
): ExtractResult {
  const known = new Set(ocrLines.map((l) => l.id));
  // Không cho AI đổi con số: "3.500.000" thành "5.500.000" là lỗi nặng nhất của app.
  const { fixes, uncertain } = reviewCorrections(out, ocrLines, reread);
  if (reread && reread.size > 0) {
    const pages = [...new Set(ocrLines.filter((l) => reread.has(l.id)).map((l) => l.page))];
    for (const page of pages) {
      const onPage = ocrLines.filter((l) => l.page === page);
      const still = uncertain.filter((id) => onPage.some((l) => l.id === id)).length;
      console.log(`[B2b] trang ${page}: đọc lại ${onPage.length} dòng, còn ${still} dòng lệch số`);
    }
  }
  if (uncertain.length > 0) {
    // Không ghi nội dung dòng ra log: hợp đồng có tên, số điện thoại, CCCD.
    console.warn(`[B2] ${uncertain.length} dòng có con số chưa chắc, giữ chữ OCR: ${uncertain.join(', ')}`);
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
    unreadablePages: [...new Set([...out.unreadable_pages, ...hardToReadPages(ocrLines, uncertain)])]
      .filter((p) => Number.isInteger(p) && p >= 1 && p <= pageCount)
      .sort((a, b) => a - b),
    lines,
    keyTerms: KeyTermsSchema.parse(terms),
  };
}
