import { OcrLineSchema } from '@rental/shared';
import { describe, expect, it } from 'vitest';

import { annotationToLines, lineId, type VisionSymbol, type VisionWord } from '../ocr/lines';

/** Tạo một từ: mỗi ký tự rộng 10px, cao 20px, bắt đầu tại (x, y). */
function word(text: string, x: number, y: number, last?: VisionSymbol['property']): VisionWord {
  const chars = [...text];
  return {
    symbols: chars.map((ch, i) => ({
      text: ch,
      boundingBox: {
        vertices: [
          { x: x + i * 10, y },
          { x: x + (i + 1) * 10, y },
          { x: x + (i + 1) * 10, y: y + 20 },
          { x: x + i * 10, y: y + 20 },
        ],
      },
      property: i === chars.length - 1 ? last : null,
    })),
  };
}

const SPACE = { detectedBreak: { type: 'SPACE' as const } };
const EOL = { detectedBreak: { type: 'EOL_SURE_SPACE' as const } };
const LINE_BREAK = { detectedBreak: { type: 'LINE_BREAK' as const } };

describe('annotationToLines', () => {
  it('ghép ký tự thành dòng theo detectedBreak và chuẩn hóa bbox', () => {
    const result = annotationToLines(1, {
      pages: [
        {
          width: 1000,
          height: 2000,
          blocks: [
            {
              paragraphs: [
                {
                  words: [
                    word('Tiền', 100, 100, SPACE),
                    word('cọc:', 150, 100, SPACE),
                    word('7tr', 200, 100, EOL),
                    word('Điện', 100, 140, SPACE),
                    word('4k/số', 150, 140, LINE_BREAK),
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.info).toEqual({ page: 1, width: 1000, height: 2000 });
    expect(result.lines.map((l) => [l.id, l.text])).toEqual([
      ['p1-L01', 'Tiền cọc: 7tr'],
      ['p1-L02', 'Điện 4k/số'],
    ]);
    expect(result.lines[0].bbox).toEqual({ x: 0.1, y: 0.05, w: 0.13, h: 0.01 });
    for (const l of result.lines) expect(OcrLineSchema.safeParse(l).success).toBe(true);
  });

  it('hiểu enum dạng số, gạch nối cuối dòng, và chốt dòng khi hết đoạn', () => {
    const result = annotationToLines(2, {
      pages: [
        {
          width: 500,
          height: 500,
          blocks: [
            { paragraphs: [{ words: [word('hợp', 10, 10, { detectedBreak: { type: 4 } }), word('đồng', 10, 40)] }] },
            { paragraphs: [{ words: [word('Bên', 10, 80, { detectedBreak: { type: 1 } }), word('A', 50, 80)] }] },
          ],
        },
      ],
    });
    expect(result.lines.map((l) => [l.id, l.text])).toEqual([
      ['p2-L01', 'hợp-'],
      ['p2-L02', 'đồng'],
      ['p2-L03', 'Bên A'],
    ]);
  });

  it('trang trắng trả về 0 dòng, dùng kích thước dự phòng', () => {
    const result = annotationToLines(3, null, { width: 800, height: 600 });
    expect(result).toEqual({ info: { page: 3, width: 800, height: 600 }, lines: [] });
  });

  it('bbox không vượt ra ngoài 0..1 khi tọa độ lệch mép', () => {
    const result = annotationToLines(1, {
      pages: [{ width: 100, height: 100, blocks: [{ paragraphs: [{ words: [word('xa', 95, -5)] }] }] }],
    });
    const { bbox } = result.lines[0];
    expect(bbox.x + bbox.w).toBeLessThanOrEqual(1);
    expect(bbox.y).toBe(0);
  });

  it('mã dòng có 2 chữ số như hợp đồng mẫu', () => {
    expect(lineId(1, 3)).toBe('p1-L03');
    expect(lineId(2, 120)).toBe('p2-L120');
  });
});

describe('mergeRows', () => {
  const l = (id: string, text: string, x: number, y: number, w: number, h = 0.02) => ({
    id,
    page: 1,
    text,
    bbox: { x, y, w, h },
  });

  it('xếp lại theo hàng và nối các mảnh cùng hàng sát nhau (số liệu từ lần chạy Vision thật)', async () => {
    const { mergeRows } = await import('../ocr/lines');
    const out = mergeRows(1, [
      l('a', 'Hôm nay,', 0.0887, 0.2161, 0.0935, 0.016),
      l('b', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 0.271, 0.0701, 0.4992),
      l('c', 'ngày 01 tháng 11 năm 2026', 0.1895, 0.2127, 0.5371),
      l('d', 'thì không được hoàn lại tiền', 0.0887, 0.5547, 0.579),
      l('e', 'cọc.', 0.6758, 0.5627, 0.0387, 0.0091),
      l('f', 'BÊN A (ký)', 0.0895, 0.8, 0.2589),
      l('g', 'BÊN B (ký)', 0.6129, 0.8, 0.2621),
    ]);
    expect(out.map((x) => [x.id, x.text])).toEqual([
      ['p1-L01', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'],
      ['p1-L02', 'Hôm nay, ngày 01 tháng 11 năm 2026'],
      ['p1-L03', 'thì không được hoàn lại tiền cọc.'],
      ['p1-L04', 'BÊN A (ký)'],
      ['p1-L05', 'BÊN B (ký)'],
    ]);
    expect(out[1].bbox).toEqual({ x: 0.0887, y: 0.2127, w: 0.6379, h: 0.02 });
  });
});

describe('mergeRows trên ảnh chụp thật (lỗi gặp ngày 14/11)', () => {
  const l = (id: string, text: string, x: number, y: number, w: number, h = 0.02) => ({
    id,
    page: 1,
    text,
    bbox: { x, y, w, h },
  });

  it('ảnh nghiêng: các dòng gối lên nhau không bị gộp dây chuyền thành một hàng', async () => {
    const { mergeRows } = await import('../ocr/lines');
    // Mỗi dòng thấp hơn dòng trước 0,013 (gối lên nhau 35% chiều cao) do ảnh nghiêng.
    const input = [0, 1, 2, 3, 4].map((i) => l(`l${i}`, `dòng ${i + 1}`, 0.1, 0.3 + i * 0.013, 0.7));
    const out = mergeRows(1, input);
    expect(out.map((x) => x.text)).toEqual(['dòng 1', 'dòng 2', 'dòng 3', 'dòng 4', 'dòng 5']);
  });

  it('hai mảnh cùng hàng nhưng chồng lên nhau theo chiều ngang thì không nối', async () => {
    const { mergeRows } = await import('../ocr/lines');
    const out = mergeRows(1, [
      l('a', 'b) Bảo đảm quyền sử dụng', 0.1, 0.5, 0.6),
      l('b', 'c) Hướng dẫn, đôn đốc', 0.12, 0.505, 0.5),
    ]);
    expect(out.map((x) => x.text)).toEqual(['b) Bảo đảm quyền sử dụng', 'c) Hướng dẫn, đôn đốc']);
  });

  it('khối nhiều dòng (cao gấp nhiều lần) không bị nối với dòng thường bên cạnh', async () => {
    const { mergeRows } = await import('../ocr/lines');
    const out = mergeRows(1, [
      l('a', 'ĐIỀU 6', 0.05, 0.5, 0.1),
      l('b', 'khối ba dòng', 0.16, 0.48, 0.6, 0.07),
    ]);
    expect(out).toHaveLength(2);
  });
});

describe('annotationToLines khi Vision không đánh dấu xuống dòng', () => {
  it('tách dòng khi từ tiếp theo nằm hẳn bên dưới từ trước', () => {
    const result = annotationToLines(1, {
      pages: [
        {
          width: 1000,
          height: 1000,
          blocks: [
            {
              paragraphs: [
                {
                  // Không có EOL/LINE_BREAK giữa hai dòng thật.
                  words: [
                    word('Dòng', 100, 100, SPACE),
                    word('một', 160, 100, SPACE),
                    word('Dòng', 100, 140, SPACE),
                    word('hai', 160, 140),
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(result.lines.map((x) => x.text)).toEqual(['Dòng một', 'Dòng hai']);
  });
});
