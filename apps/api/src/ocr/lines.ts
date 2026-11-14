/**
 * Ghép kết quả DOCUMENT_TEXT_DETECTION của Google Vision thành từng dòng.
 *
 * Vision trả chữ theo khối → đoạn → từ → ký tự, không có "dòng". Mỗi ký tự có
 * thể mang `detectedBreak`: SPACE / SURE_SPACE là dấu cách, EOL_SURE_SPACE /
 * LINE_BREAK là hết dòng, HYPHEN là gạch nối cuối dòng. Ta đi lần lượt các ký
 * tự, gặp dấu hết dòng thì chốt một dòng, và lấy khung bao của các ký tự đó.
 *
 * Hàm thuần: nhận dữ liệu Vision, trả dòng có mã "p{trang}-L{số}" và bbox
 * chuẩn hóa 0..1 theo kích thước ảnh.
 */
import type { BBox, OcrLine, PageInfo } from '@rental/shared';

// Kiểu tối thiểu của phản hồi Vision mà ta dùng (để test không cần thư viện Google).
export type VisionVertex = { x?: number | null; y?: number | null };
export type VisionBreakType =
  | 'UNKNOWN'
  | 'SPACE'
  | 'SURE_SPACE'
  | 'EOL_SURE_SPACE'
  | 'HYPHEN'
  | 'LINE_BREAK'
  | number
  | null
  | undefined;
export type VisionSymbol = {
  text?: string | null;
  boundingBox?: { vertices?: VisionVertex[] | null } | null;
  property?: { detectedBreak?: { type?: VisionBreakType } | null } | null;
};
export type VisionWord = {
  symbols?: VisionSymbol[] | null;
  boundingBox?: { vertices?: VisionVertex[] | null } | null;
};
export type VisionParagraph = { words?: VisionWord[] | null };
export type VisionBlock = { paragraphs?: VisionParagraph[] | null };
export type VisionPage = {
  width?: number | null;
  height?: number | null;
  blocks?: VisionBlock[] | null;
};
export type VisionTextAnnotation = { pages?: VisionPage[] | null; text?: string | null };

// Enum số của Vision (khi thư viện trả số thay vì tên).
const BREAK_BY_NUMBER: Record<number, string> = {
  0: 'UNKNOWN',
  1: 'SPACE',
  2: 'SURE_SPACE',
  3: 'EOL_SURE_SPACE',
  4: 'HYPHEN',
  5: 'LINE_BREAK',
};

function breakName(type: VisionBreakType): string | undefined {
  if (type == null) return undefined;
  return typeof type === 'number' ? BREAK_BY_NUMBER[type] : type;
}

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function extend(box: Box | null, vertices: VisionVertex[] | null | undefined): Box | null {
  if (!vertices || vertices.length === 0) return box;
  let b = box ?? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const v of vertices) {
    const x = v.x ?? 0;
    const y = v.y ?? 0;
    b = {
      minX: Math.min(b.minX, x),
      minY: Math.min(b.minY, y),
      maxX: Math.max(b.maxX, x),
      maxY: Math.max(b.maxY, y),
    };
  }
  return b;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round4 = (n: number) => Math.round(n * 10000) / 10000;

function normalizeBox(box: Box, width: number, height: number): BBox {
  const x = clamp01(box.minX / width);
  const y = clamp01(box.minY / height);
  const x2 = clamp01(box.maxX / width);
  const y2 = clamp01(box.maxY / height);
  return { x: round4(x), y: round4(y), w: round4(x2 - x), h: round4(y2 - y) };
}

export function lineId(page: number, index: number): string {
  return `p${page}-L${String(index).padStart(2, '0')}`;
}

export type PageLines = { info: PageInfo; lines: OcrLine[] };

/**
 * @param page số trang (bắt đầu từ 1) theo thứ tự ảnh gửi lên
 * @param annotation fullTextAnnotation của ảnh trang đó (null nếu Vision không thấy chữ)
 * @param fallbackSize kích thước ảnh nếu Vision không trả width/height
 */
export function annotationToLines(
  page: number,
  annotation: VisionTextAnnotation | null | undefined,
  fallbackSize?: { width: number; height: number },
): PageLines {
  const vPage = annotation?.pages?.[0];
  const width = vPage?.width || fallbackSize?.width || 1;
  const height = vPage?.height || fallbackSize?.height || 1;
  const lines: OcrLine[] = [];

  let text = '';
  let box: Box | null = null;
  /** Khung của từ vừa đọc, để nhận ra chỗ xuống dòng mà Vision không đánh dấu. */
  let lastWord: Box | null = null;

  const flush = () => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean && box) {
      lines.push({
        id: lineId(page, lines.length + 1),
        page,
        text: clean,
        bbox: normalizeBox(box, width, height),
      });
    }
    text = '';
    box = null;
    lastWord = null;
  };

  for (const block of vPage?.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const word of paragraph.words ?? []) {
        const symbols = word.symbols ?? [];
        if (symbols.length === 0) continue;
        const wordBox = symbols.reduce<Box | null>(
          (b, sym) => extend(b, sym.boundingBox?.vertices),
          extend(null, word.boundingBox?.vertices),
        );
        // Vision đôi khi không đánh dấu xuống dòng trong một đoạn: nếu từ này nằm hẳn
        // bên dưới từ trước (tâm thấp hơn đáy từ trước) thì là dòng mới.
        if (wordBox && lastWord && (wordBox.minY + wordBox.maxY) / 2 > lastWord.maxY) flush();
        for (const symbol of symbols) {
          text += symbol.text ?? '';
          box = extend(box, symbol.boundingBox?.vertices ?? word.boundingBox?.vertices);
          const br = breakName(symbol.property?.detectedBreak?.type);
          if (br === 'SPACE' || br === 'SURE_SPACE') text += ' ';
          else if (br === 'HYPHEN') {
            text += '-';
            flush();
          } else if (br === 'EOL_SURE_SPACE' || br === 'LINE_BREAK') flush();
        }
        // flush() ở trên đặt lastWord = null; chỉ nhớ từ khi dòng còn đang mở.
        if (text) lastWord = wordBox;
      }
      // Hết đoạn thì luôn chốt dòng, kể cả khi Vision không đánh dấu.
      flush();
    }
  }
  flush();

  return { info: { page, width, height }, lines: mergeRows(page, lines) };
}

/** Khoảng trống ngang tối đa (theo bề rộng trang) để coi hai mảnh là cùng một dòng. */
const MAX_GAP = 0.03;
/** Hai mảnh được phép chồng lên nhau theo chiều ngang tối đa chừng này (do khung chữ hơi rộng). */
const MAX_OVERLAP = 0.005;
/** Hai mảnh cùng dòng thì chiều cao không chênh quá mức này ("cọc." thấp hơn chữ hoa ~2 lần). */
const MAX_HEIGHT_RATIO = 2.5;

const centerY = (b: BBox) => b.y + b.h / 2;

/**
 * Vision đôi khi cắt một dòng thành hai khối ("Hôm nay," | "ngày 01 tháng…",
 * hoặc "…không được hoàn lại tiền" | "cọc.") và trả sai thứ tự đọc. Xếp lại
 * theo hàng từ trên xuống, rồi nối các mảnh nằm cùng hàng, mảnh sau ở bên phải
 * và sát mảnh trước.
 *
 * Không nối khi: hai mảnh lệch tâm quá nửa chiều cao (dòng trên/dưới, kể cả
 * ảnh chụp nghiêng), chiều cao chênh nhiều (một khối nhiều dòng), chồng lên
 * nhau theo chiều ngang (hai dòng xếp chồng), hoặc cách xa (hai cột, hai ô ký).
 */
export function mergeRows(page: number, lines: OcrLine[]): OcrLine[] {
  const sameRow = (a: BBox, b: BBox) => {
    const minH = Math.min(a.h, b.h);
    const maxH = Math.max(a.h, b.h);
    if (minH <= 0 || maxH / minH > MAX_HEIGHT_RATIO) return false;
    return Math.abs(centerY(a) - centerY(b)) <= 0.5 * minH;
  };

  // So với mảnh đầu tiên của hàng, không so dây chuyền: ảnh nghiêng làm các
  // dòng gối lên nhau, so dây chuyền sẽ gộp cả trang thành một hàng.
  const rows: OcrLine[][] = [];
  for (const l of [...lines].sort((a, b) => centerY(a.bbox) - centerY(b.bbox))) {
    const row = rows.find((r) => sameRow(r[0].bbox, l.bbox));
    if (row) row.push(l);
    else rows.push([l]);
  }

  const out: OcrLine[] = [];
  for (const row of rows.sort((a, b) => centerY(a[0].bbox) - centerY(b[0].bbox))) {
    let current = null as OcrLine | null;
    for (const l of row.sort((a, b) => a.bbox.x - b.bbox.x)) {
      const gap = current ? l.bbox.x - (current.bbox.x + current.bbox.w) : Infinity;
      if (current && gap >= -MAX_OVERLAP && gap <= MAX_GAP) {
        const x = Math.min(current.bbox.x, l.bbox.x);
        const y = Math.min(current.bbox.y, l.bbox.y);
        const x2 = Math.max(current.bbox.x + current.bbox.w, l.bbox.x + l.bbox.w);
        const y2 = Math.max(current.bbox.y + current.bbox.h, l.bbox.y + l.bbox.h);
        current = {
          ...current,
          text: `${current.text} ${l.text}`,
          bbox: { x: round4(x), y: round4(y), w: round4(x2 - x), h: round4(y2 - y) },
        };
      } else {
        if (current) out.push(current);
        current = l;
      }
    }
    if (current) out.push(current);
  }
  return out.map((l, i) => ({ ...l, id: lineId(page, i + 1) }));
}
