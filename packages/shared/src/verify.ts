/**
 * Kiểm tra lại cảnh báo của LLM trước khi gửi cho app (chặn AI bịa nội dung).
 *
 * - Mã dòng phải tồn tại trong kết quả OCR.
 * - Câu trích (quote) phải khớp với chữ trên các dòng đó.
 *     khớp nguyên văn (sau khi chuẩn hóa dấu cách, hoa thường, dấu câu) → giữ
 *     khớp gần đúng (≥ 80% từ)                                         → giữ, hạ độ tin cậy
 *     nằm ở dòng khác                                                  → sửa line_ids, hạ nhẹ độ tin cậy
 *     không tìm thấy                                                    → bỏ cảnh báo
 * - Cảnh báo "missing" luôn có line_ids rỗng và quote rỗng.
 */
import { LOW_CONFIDENCE, type Flag, type LineId, type OcrLine } from './index';

export type VerifyOutcome = 'exact' | 'fuzzy' | 'relocated' | 'missing_type' | 'dropped';

export type VerifiedFlag = { flag: Flag; outcome: VerifyOutcome };

export type DroppedFlag = { flag: Flag; reason: string };

export type VerifyResult = {
  kept: VerifiedFlag[];
  dropped: DroppedFlag[];
};

/** Tỉ lệ từ tối thiểu để coi là khớp gần đúng. */
export const FUZZY_MIN_RATIO = 0.8;
/** Độ tin cậy tối đa của cảnh báo khớp gần đúng: dưới LOW_CONFIDENCE để app ghi "AI không chắc". */
export const FUZZY_MAX_CONFIDENCE = Math.max(0, LOW_CONFIDENCE - 0.05);

/**
 * Chuẩn hóa để so khớp: Unicode NFC, chữ thường, bỏ dấu câu và ngoặc kép,
 * gộp khoảng trắng. Giữ nguyên dấu tiếng Việt vì "cọc" và "cốc" khác nghĩa.
 */
export function normalizeText(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[“”"'‘’`«»]/g, ' ')
    .replace(/[.,;:!?()[\]{}\-–—_/\\*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tách câu trích thành các đoạn nếu LLM dùng "…" hoặc "..." để lược bớt. */
function quoteSegments(quote: string): string[] {
  return quote
    .split(/…|\.{3,}/)
    .map(normalizeText)
    .filter((s) => s.length > 0);
}

/** Mọi đoạn đều có mặt, theo đúng thứ tự. */
function containsInOrder(haystack: string, segments: string[]): boolean {
  let from = 0;
  for (const seg of segments) {
    const at = haystack.indexOf(seg, from);
    if (at < 0) return false;
    from = at + seg.length;
  }
  return segments.length > 0;
}

function tokenRatio(haystack: string, segments: string[]): number {
  const have = new Set(haystack.split(' '));
  const words = segments.join(' ').split(' ').filter(Boolean);
  if (words.length === 0) return 0;
  return words.filter((w) => have.has(w)).length / words.length;
}

function joinLines(ids: LineId[], byId: Map<string, OcrLine>): string {
  return normalizeText(ids.map((id) => byId.get(id)?.text ?? '').join(' '));
}

/**
 * Tìm các dòng chứa câu trích ở chỗ khác trong hợp đồng: thử từng dòng và
 * từng cụm tối đa 3 dòng liền nhau trên cùng trang.
 */
function relocate(segments: string[], lines: OcrLine[]): LineId[] | null {
  for (let span = 1; span <= 3; span++) {
    for (let i = 0; i + span <= lines.length; i++) {
      const group = lines.slice(i, i + span);
      if (group.some((l) => l.page !== group[0].page)) continue;
      const text = normalizeText(group.map((l) => l.text).join(' '));
      if (containsInOrder(text, segments)) return group.map((l) => l.id);
    }
  }
  return null;
}

export function verifyFlags(flags: Flag[], lines: OcrLine[]): VerifyResult {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const kept: VerifiedFlag[] = [];
  const dropped: DroppedFlag[] = [];

  for (const original of flags) {
    if (original.type === 'missing') {
      kept.push({ flag: { ...original, line_ids: [], quote: '' }, outcome: 'missing_type' });
      continue;
    }

    const segments = quoteSegments(original.quote);
    if (segments.length === 0) {
      dropped.push({ flag: original, reason: 'Cảnh báo risky/unclear không có câu trích' });
      continue;
    }

    const validIds = original.line_ids.filter((id) => byId.has(id));
    if (validIds.length > 0) {
      const text = joinLines(validIds, byId);
      if (containsInOrder(text, segments)) {
        kept.push({ flag: { ...original, line_ids: validIds }, outcome: 'exact' });
        continue;
      }
    }

    const found = relocate(segments, lines);
    if (found) {
      kept.push({
        flag: { ...original, line_ids: found, confidence: Math.min(original.confidence, 0.75) },
        outcome: 'relocated',
      });
      continue;
    }

    if (validIds.length > 0 && tokenRatio(joinLines(validIds, byId), segments) >= FUZZY_MIN_RATIO) {
      kept.push({
        flag: {
          ...original,
          line_ids: validIds,
          confidence: Math.min(original.confidence, FUZZY_MAX_CONFIDENCE),
        },
        outcome: 'fuzzy',
      });
      continue;
    }

    dropped.push({
      flag: original,
      reason:
        validIds.length === 0
          ? `Mã dòng không tồn tại: ${original.line_ids.join(', ') || '(trống)'}`
          : 'Câu trích không khớp với chữ trên dòng',
    });
  }

  return { kept, dropped };
}
