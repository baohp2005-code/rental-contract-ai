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
  };

  for (const block of vPage?.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const word of paragraph.words ?? []) {
        const symbols = word.symbols ?? [];
        if (symbols.length === 0) continue;
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

/**
 * Vision đôi khi cắt một dòng thành hai khối ("Hôm nay," | "ngày 01 tháng…",
 * hoặc "…không được hoàn lại tiền" | "cọc.") và trả sai thứ tự đọc. Xếp lại
 * theo hàng từ trên xuống, rồi nối các mảnh nằm cùng hàng và sát nhau.
 * Hai cột cách xa nhau (vd hai ô chữ ký) không bị nối.
 */
export function mergeRows(page: number, lines: OcrLine[]): OcrLine[] {
  const sameRow = (a: BBox, b: BBox) => {
    const overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return overlap >= 0.5 * Math.min(a.h, b.h);
  };

  const rows: OcrLine[][] = [];
  for (const l of [...lines].sort((a, b) => a.bbox.y + a.bbox.h / 2 - (b.bbox.y + b.bbox.h / 2))) {
    const row = rows.find((r) => r.some((x) => sameRow(x.bbox, l.bbox)));
    if (row) row.push(l);
    else rows.push([l]);
  }

  const out: OcrLine[] = [];
  for (const row of rows.sort((a, b) => Math.min(...a.map((l) => l.bbox.y)) - Math.min(...b.map((l) => l.bbox.y)))) {
    let current = null as OcrLine | null;
    for (const l of row.sort((a, b) => a.bbox.x - b.bbox.x)) {
      if (current && l.bbox.x - (current.bbox.x + current.bbox.w) <= MAX_GAP) {
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
