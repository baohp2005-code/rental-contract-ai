import type { OcrLine } from '@rental/shared';
import { describe, expect, it, vi } from 'vitest';

import { extract, formatPageLines, reviewCorrections, type PageImage } from '../pipeline/extract';
import { fakeLlm, found, line, notFound } from './helpers';

const img = (tag: string): PageImage => ({ data: Buffer.from(tag), mediaType: 'image/jpeg' });
const b64 = (tag: string) => Buffer.from(tag).toString('base64');

const keyTerms = (overrides = {}) => ({
  rent_vnd: notFound(),
  deposit_vnd: notFound(),
  electricity_vnd_per_kwh: notFound(),
  water_vnd: notFound(),
  water_unit: notFound(),
  service_fee_vnd: notFound(),
  term_months: notFound(),
  notice_days: notFound(),
  ...overrides,
});

/** Trang viết tay: OCR đọc sai số ở 6 dòng đầu ("Khoản i: 1.0i0.000đ" bị đọc thành 7.0i0.000). */
function handwrittenPage(page: number): { ocr: OcrLine[]; truth: string[] } {
  const truth = Array.from({ length: 10 }, (_, i) => `Khoản ${i}: 1.0${i}0.000đ`);
  const ocr = truth.map((t, i) =>
    line(`p${page}-L${String(i + 1).padStart(2, '0')}`, i < 6 ? t.replace('1.0', '7.0') : t),
  );
  return { ocr, truth };
}

describe('B2b · luật đối chiếu số (2 trong 3 lần đọc phải khớp)', () => {
  const ocr = [
    line('p1-L01', 'Gia thue 3.800.000d'),
    line('p1-L02', 'Coc 7.000.000d'),
    line('p1-L03', 'Dien 4.000d/so'),
    line('p1-L04', 'Nuoc 100.000d'),
  ];
  const out = {
    corrections: [
      { id: 'p1-L01', text: 'Giá thuê 3.500.000đ' }, // B2 đổi số
      { id: 'p1-L02', text: 'Cọc 9.000.000đ' }, // B2 đổi số
      { id: 'p1-L03', text: 'Điện 4.000đ/số' }, // B2 giữ số
    ],
  };

  it('không đọc lại: chỉ nhận bản sửa giữ nguyên số như trước', () => {
    const r = reviewCorrections(out, ocr);
    expect([...r.fixes.keys()]).toEqual(['p1-L03']);
    expect(r.uncertain).toEqual(['p1-L01', 'p1-L02']);
  });

  it('đọc lại khớp B2 → nhận số mới; khớp OCR → giữ số OCR; lệch cả hai → vẫn chưa chắc', () => {
    const reread = new Map([
      ['p1-L01', 'Giá thuê 3.500.000đ'], // khớp B2
      ['p1-L02', 'Cọc 7.000.000đ'], // khớp OCR, B2 đọc sai
      ['p1-L03', 'Điện 4.500đ/số'], // lệch cả OCR lẫn B2
      ['p1-L04', 'Nước 150.000đ'], // B2 không sửa (đồng ý OCR), đọc lại lệch
    ]);
    const r = reviewCorrections(out, ocr, reread);
    expect(r.fixes.get('p1-L01')).toBe('Giá thuê 3.500.000đ');
    expect(r.fixes.get('p1-L02')).toBe('Cọc 7.000.000đ');
    // Lệch: giữ bản B2 vì nó không đổi số so với OCR.
    expect(r.fixes.get('p1-L03')).toBe('Điện 4.000đ/số');
    expect(r.fixes.has('p1-L04')).toBe(false);
    expect(r.uncertain).toEqual(['p1-L03', 'p1-L04']);
  });

  it('gửi kèm vị trí dòng theo % chiều cao trang', () => {
    expect(formatPageLines([{ ...line('p1-L01', 'abc'), bbox: { x: 0, y: 0.3, w: 1, h: 0.04 } }])).toBe(
      '[p1-L01] (cao 32%) abc',
    );
  });
});

describe('B2b · đọc lại trang khó đọc', () => {
  const p1 = handwrittenPage(1);
  const p2 = Array.from({ length: 10 }, (_, i) => line(`p2-L${String(i + 1).padStart(2, '0')}`, `Điều ${i + 1} in rõ`));
  const ocr = [...p1.ocr, ...p2];
  // B2 đọc từ ảnh, sửa đúng số ở 6 dòng đầu trang 1 (bị chặn vì đổi số so với OCR).
  const b2 = {
    is_rental_contract: true,
    unreadable_pages: [],
    other_fees: [],
    corrections: p1.truth.slice(0, 6).map((text, i) => ({ id: p1.ocr[i].id, text })),
    key_terms: keyTerms({ rent_vnd: found(1_000_000, ['p1-L01']) }),
  };

  it('chỉ đọc lại trang khó đọc, gửi đúng ảnh trang đó; hai lần đọc khớp → không còn báo chụp lại', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { llm, calls } = fakeLlm({
      B2: b2,
      'B2b·trang 1': { lines: p1.ocr.map((l, i) => ({ id: l.id, text: p1.truth[i] })) },
    });
    const r = await extract(llm, 'sys', [img('trang1'), img('trang2')], ocr, 'reread');
    const logged = [...log.mock.calls, ...warn.mock.calls].flat().join(' ');
    log.mockRestore();
    warn.mockRestore();

    expect(calls.map((c) => c.step)).toEqual(['B2', 'B2b·trang 1']);
    const images = calls[1].content.filter((b) => b.type === 'image');
    expect(images).toEqual([{ type: 'image', mediaType: 'image/jpeg', base64: b64('trang1') }]);
    expect(r.unreadablePages).toEqual([]);
    expect(r.lines.slice(0, 10).map((l) => l.text)).toEqual(p1.truth);
    expect(r.keyTerms.rent_vnd).toMatchObject({ value: 1_000_000, status: 'found' });
    // Log chỉ có số trang, số dòng và mã dòng, không có chữ hợp đồng.
    expect(logged).toContain('[B2b] trang 1');
    expect(logged).not.toContain('Khoản');
    expect(logged).not.toContain('1.000.000');
  });

  it('đọc lại vẫn lệch số → vẫn báo trang khó đọc', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { llm } = fakeLlm({
      B2: b2,
      'B2b·trang 1': { lines: p1.ocr.map((l) => ({ id: l.id, text: 'Khoản ?: 4.444.444đ' })) },
    });
    const r = await extract(llm, 'sys', [img('trang1'), img('trang2')], ocr, 'reread');
    vi.restoreAllMocks();
    expect(r.unreadablePages).toEqual([1]);
  });

  it('gọi đọc lại lỗi → không làm hỏng cả lượt, trang vẫn bị báo khó đọc', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { llm } = fakeLlm({ B2: b2 }); // không có câu trả lời cho B2b → ném lỗi
    const r = await extract(llm, 'sys', [img('trang1'), img('trang2')], ocr, 'reread');
    const logged = warn.mock.calls.flat().join(' ');
    vi.restoreAllMocks();
    expect(r.unreadablePages).toEqual([1]);
    expect(logged).toContain('đọc lại thất bại');
  });

  it('hợp đồng in rõ (không trang nào khó đọc) → không tốn thêm lần gọi', async () => {
    const { llm, calls } = fakeLlm({
      B2: { ...b2, corrections: [], key_terms: keyTerms() },
    });
    await extract(llm, 'sys', [img('trang1'), img('trang2')], [...p1.truth.map((t, i) => ({ ...p1.ocr[i], text: t })), ...p2], 'reread');
    expect(calls.map((c) => c.step)).toEqual(['B2']);
  });
});
