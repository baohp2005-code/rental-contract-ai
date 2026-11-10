import type { BBox } from '@rental/shared';

import {
  applyTransform,
  bboxToRect,
  clampBBox,
  clampTransform,
  fitContain,
  fitWidth,
  focusRegion,
  focusTransform,
  focusViewportHeight,
  padBBox,
  toCenterOriginTranslate,
  translateBounds,
  unionBBox,
  zoomAround,
  type Rect,
  type Size,
  type ViewTransform,
} from '@/lib/geometry';
import { sampleAnalysis } from '@/mocks/sample-analysis';

const PORTRAIT: Size = { width: 1240, height: 1754 }; // ảnh mẫu A4 dọc
const LANDSCAPE: Size = { width: 1754, height: 1240 }; // trang chụp ngang
const PHONE: Size = { width: 390, height: 844 };
const EPS = 1e-6;

/** Một dòng thật trong hợp đồng mẫu (p1-L12). */
const LINE: BBox = { x: 0.0839, y: 0.5507, w: 0.7258, h: 0.0285 };

function expectRectInside(inner: Rect, outer: Size) {
  expect(inner.x).toBeGreaterThanOrEqual(-EPS);
  expect(inner.y).toBeGreaterThanOrEqual(-EPS);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.width + EPS);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.height + EPS);
}

/** Ảnh đã phóng phải phủ kín khung nhìn (không lộ khoảng trống) khi nó lớn hơn khung. */
function expectCovers(t: ViewTransform, content: Size, viewport: Size) {
  const page = applyTransform({ x: 0, y: 0, ...content }, t);
  if (page.width >= viewport.width) {
    expect(page.x).toBeLessThanOrEqual(EPS);
    expect(page.x + page.width).toBeGreaterThanOrEqual(viewport.width - EPS);
  }
  if (page.height >= viewport.height) {
    expect(page.y).toBeLessThanOrEqual(EPS);
    expect(page.y + page.height).toBeGreaterThanOrEqual(viewport.height - EPS);
  }
}

describe('bboxToRect', () => {
  it('nhân bbox chuẩn hóa với kích thước hiển thị (ảnh dọc)', () => {
    const r = bboxToRect(LINE, { width: 310, height: 438.5 });
    expect(r.x).toBeCloseTo(0.0839 * 310);
    expect(r.y).toBeCloseTo(0.5507 * 438.5);
    expect(r.width).toBeCloseTo(0.7258 * 310);
    expect(r.height).toBeCloseTo(0.0285 * 438.5);
  });

  it('cùng một bbox cho tỉ lệ đúng ở mọi cỡ hiển thị', () => {
    const small = bboxToRect(LINE, { width: 100, height: 141.45 });
    const big = bboxToRect(LINE, { width: 1000, height: 1414.5 });
    expect(big.x / small.x).toBeCloseTo(10);
    expect(big.y / small.y).toBeCloseTo(10);
    expect(big.width / small.width).toBeCloseTo(10);
    expect(big.height / small.height).toBeCloseTo(10);
  });

  it('ảnh ngang: x theo chiều rộng, y theo chiều cao', () => {
    const r = bboxToRect({ x: 0.5, y: 0.5, w: 0.25, h: 0.1 }, { width: 800, height: 400 });
    expect(r).toEqual({ x: 400, y: 200, width: 200, height: 40 });
  });
});

describe('clampBBox / padBBox', () => {
  it('cắt hộp tràn ra ngoài mép ảnh', () => {
    const b = clampBBox({ x: 0.9, y: 0.95, w: 0.3, h: 0.2 });
    expect(b.x).toBeCloseTo(0.9);
    expect(b.x + b.w).toBeCloseTo(1);
    expect(b.y + b.h).toBeCloseTo(1);
  });

  it('nới hộp sát mép không vượt quá 0..1', () => {
    const b = padBBox({ x: 0.01, y: 0.97, w: 0.5, h: 0.02 }, 0.05, 0.05);
    expect(b.x).toBe(0);
    expect(b.y).toBeCloseTo(0.92);
    expect(b.y + b.h).toBeCloseTo(1);
    expect(b.x + b.w).toBeCloseTo(0.56);
  });
});

describe('unionBBox', () => {
  it('rỗng → null', () => {
    expect(unionBBox([])).toBeNull();
  });

  it('gộp nhiều dòng thành một hộp chứa tất cả', () => {
    const a: BBox = { x: 0.0839, y: 0.4253, w: 0.8323, h: 0.0285 }; // p1-L09
    const b: BBox = { x: 0.0839, y: 0.4595, w: 0.5669, h: 0.0285 }; // p1-L10
    const c: BBox = { x: 0.2, y: 0.5, w: 0.1, h: 0.03 };
    const u = unionBBox([a, b, c])!;
    expect(u.x).toBeCloseTo(0.0839);
    expect(u.y).toBeCloseTo(0.4253);
    expect(u.x + u.w).toBeCloseTo(0.0839 + 0.8323);
    expect(u.y + u.h).toBeCloseTo(0.53);
    for (const box of [a, b, c]) {
      expect(box.x).toBeGreaterThanOrEqual(u.x - EPS);
      expect(box.y).toBeGreaterThanOrEqual(u.y - EPS);
      expect(box.x + box.w).toBeLessThanOrEqual(u.x + u.w + EPS);
      expect(box.y + box.h).toBeLessThanOrEqual(u.y + u.h + EPS);
    }
  });

  it('một dòng → chính dòng đó', () => {
    const u = unionBBox([LINE])!;
    expect(u.x).toBeCloseTo(LINE.x);
    expect(u.w).toBeCloseTo(LINE.w);
  });
});

describe('focusRegion', () => {
  it('chứa các dòng và thêm ngữ cảnh phía trên, dưới', () => {
    const r = focusRegion([LINE])!;
    expect(r.y).toBeLessThan(LINE.y);
    expect(r.y + r.h).toBeGreaterThan(LINE.y + LINE.h);
    expect(r.x).toBeLessThan(LINE.x);
  });
});

describe('fitContain / fitWidth', () => {
  it('ảnh dọc vừa khung điện thoại: kín chiều rộng, căn giữa theo chiều dọc', () => {
    const r = fitContain(PORTRAIT, PHONE);
    expect(r.width).toBeCloseTo(390);
    expect(r.height).toBeCloseTo((390 * 1754) / 1240);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo((844 - r.height) / 2);
  });

  it('ảnh ngang vừa khung điện thoại: giữ tỉ lệ, chừa khoảng trên dưới', () => {
    const r = fitContain(LANDSCAPE, PHONE);
    expect(r.width).toBeCloseTo(390);
    expect(r.width / r.height).toBeCloseTo(1754 / 1240);
    expect(r.y).toBeGreaterThan(0);
  });

  it('ảnh rất cao (chụp dài) thì kín chiều cao', () => {
    const r = fitContain({ width: 1000, height: 4000 }, PHONE);
    expect(r.height).toBeCloseTo(844);
    expect(r.x).toBeGreaterThan(0);
  });

  it('fitWidth giữ tỉ lệ ảnh', () => {
    expect(fitWidth(PORTRAIT, 310).height).toBeCloseTo((310 * 1754) / 1240);
    expect(fitWidth(LANDSCAPE, 310).height).toBeCloseTo((310 * 1240) / 1754);
  });
});

describe('focusTransform', () => {
  const limits = { minScale: 1, maxScale: 4 };

  it('đưa dòng vào giữa khung và thấy trọn dòng (ảnh dọc, khung xem tập trung)', () => {
    const content = fitWidth(PORTRAIT, 358);
    const viewport = { width: 358, height: 200 };
    const t = focusTransform(LINE, content, viewport, limits);
    const line = applyTransform(bboxToRect(LINE, content), t);
    expectRectInside(line, viewport);
    expect(line.x + line.width / 2).toBeCloseTo(viewport.width / 2, 0);
    expect(line.y + line.height / 2).toBeCloseTo(viewport.height / 2, 0);
    expect(t.scale).toBeGreaterThan(1);
    expectCovers(t, content, viewport);
  });

  it('trình xem cả trang: dòng nằm trong màn hình, trang nhỏ hơn màn thì căn giữa', () => {
    const content = fitContain(PORTRAIT, PHONE);
    const t = focusTransform(LINE, content, PHONE, limits);
    expectRectInside(applyTransform(bboxToRect(LINE, content), t), PHONE);
    expect(t.scale).toBeGreaterThanOrEqual(1);
    expectCovers(t, content, PHONE);
  });

  it('dòng ngắn thì phóng to nhưng không quá maxScale', () => {
    const short: BBox = { x: 0.4, y: 0.4, w: 0.05, h: 0.02 };
    const content = fitContain(PORTRAIT, PHONE);
    const t = focusTransform(short, content, PHONE, limits);
    expect(t.scale).toBe(4);
    expectRectInside(applyTransform(bboxToRect(short, content), t), PHONE);
  });

  it('dòng sát mép dưới trang: vẫn nằm trong khung, ảnh không lộ khoảng trống', () => {
    const edge: BBox = { x: 0.6, y: 0.975, w: 0.39, h: 0.025 };
    const content = fitWidth(PORTRAIT, 358);
    const viewport = { width: 358, height: 160 };
    const t = focusTransform(focusRegion([edge])!, content, viewport, limits);
    expectRectInside(applyTransform(bboxToRect(edge, content), t), viewport);
    expectCovers(t, content, viewport);
  });

  it('dòng sát mép trên-trái trang', () => {
    const edge: BBox = { x: 0, y: 0, w: 0.3, h: 0.03 };
    const content = fitWidth(PORTRAIT, 358);
    const viewport = { width: 358, height: 160 };
    const t = focusTransform(focusRegion([edge])!, content, viewport, limits);
    expect(t.translateX).toBeLessThanOrEqual(EPS);
    expect(t.translateY).toBeLessThanOrEqual(EPS);
    expectRectInside(applyTransform(bboxToRect(edge, content), t), viewport);
    expectCovers(t, content, viewport);
  });

  it('ảnh ngang: dòng nằm trong khung và giữ đúng vị trí tương đối', () => {
    const content = fitContain(LANDSCAPE, PHONE);
    const t = focusTransform(LINE, content, PHONE, limits);
    const line = applyTransform(bboxToRect(LINE, content), t);
    expectRectInside(line, PHONE);
    expectCovers(t, content, PHONE);
    // Tỉ lệ khung của dòng trên màn hình đúng bằng tỉ lệ thật trên ảnh ngang.
    expect(line.width / line.height).toBeCloseTo((LINE.w * 1754) / (LINE.h * 1240));
  });

  it('nhiều dòng: thấy trọn hộp gộp', () => {
    const lines: BBox[] = [
      { x: 0.0839, y: 0.4253, w: 0.8323, h: 0.0285 },
      { x: 0.0839, y: 0.4595, w: 0.5669, h: 0.0285 },
      { x: 0.0839, y: 0.5165, w: 0.6694, h: 0.0285 },
    ];
    const content = fitWidth(PORTRAIT, 358);
    const region = focusRegion(lines)!;
    const height = focusViewportHeight(region, PORTRAIT, 358, {
      minHeight: 140,
      maxHeight: 320,
      maxScale: 3,
    });
    const viewport = { width: 358, height };
    const t = focusTransform(region, content, viewport, { minScale: 1, maxScale: 3 });
    for (const b of lines) {
      expectRectInside(applyTransform(bboxToRect(b, content), t), viewport);
    }
  });
});

describe('focusViewportHeight', () => {
  const limits = { minHeight: 140, maxHeight: 320, maxScale: 3 };

  it('nằm trong giới hạn với mọi dòng của hợp đồng mẫu', () => {
    for (const line of sampleAnalysis.lines) {
      const h = focusViewportHeight(focusRegion([line.bbox])!, PORTRAIT, 358, limits);
      expect(h).toBeGreaterThanOrEqual(140);
      expect(h).toBeLessThanOrEqual(320);
    }
  });

  it('trang ngang rất thấp: không cao hơn cả trang', () => {
    const wide = { width: 4000, height: 500 };
    const h = focusViewportHeight({ x: 0, y: 0, w: 1, h: 1 }, wide, 358, limits);
    expect(h).toBeLessThanOrEqual((358 * 500) / 4000 + EPS);
  });
});

describe('clampTransform', () => {
  it('ảnh nhỏ hơn khung thì căn giữa', () => {
    const content = { width: 200, height: 100 };
    const t = clampTransform({ scale: 1, translateX: -50, translateY: 999 }, content, PHONE);
    expect(t.translateX).toBeCloseTo(95);
    expect(t.translateY).toBeCloseTo(372);
  });

  it('ảnh lớn hơn khung thì không kéo lộ mép', () => {
    const content = fitContain(PORTRAIT, PHONE);
    const t = clampTransform({ scale: 3, translateX: 100, translateY: -1e6 }, content, PHONE);
    expect(t.translateX).toBe(0);
    expectCovers(t, content, PHONE);
  });
});

describe('translateBounds', () => {
  it('ảnh lớn hơn khung: dịch từ (khung - ảnh) tới 0; nhỏ hơn: cố định ở giữa', () => {
    const b = translateBounds(2, { width: 390, height: 300 }, PHONE);
    expect(b.minX).toBeCloseTo(390 - 780);
    expect(b.maxX).toBe(0);
    expect(b.minY).toBeCloseTo((844 - 600) / 2);
    expect(b.maxY).toBeCloseTo((844 - 600) / 2);
  });
});

describe('zoomAround', () => {
  it('điểm chụm hai ngón đứng yên khi phóng', () => {
    const t: ViewTransform = { scale: 1.5, translateX: -20, translateY: 40 };
    const focal = { x: 123, y: 456 };
    const z = zoomAround(t, focal, 3.2);
    const before = { x: (focal.x - t.translateX) / t.scale, y: (focal.y - t.translateY) / t.scale };
    expect(before.x * z.scale + z.translateX).toBeCloseTo(focal.x);
    expect(before.y * z.scale + z.translateY).toBeCloseTo(focal.y);
  });
});

describe('toCenterOriginTranslate', () => {
  it('khớp với cách React Native phóng quanh tâm view', () => {
    const content = { width: 390, height: 552 };
    const t: ViewTransform = { scale: 2.5, translateX: -300, translateY: -120 };
    const tr = toCenterOriginTranslate(t, content);
    // RN: màn hình = tâm + dịch + scale * (p - tâm)
    const rn = (p: { x: number; y: number }) => ({
      x: content.width / 2 + tr.x + t.scale * (p.x - content.width / 2),
      y: content.height / 2 + tr.y + t.scale * (p.y - content.height / 2),
    });
    for (const p of [
      { x: 0, y: 0 },
      { x: 390, y: 552 },
      { x: 100, y: 300 },
    ]) {
      expect(rn(p).x).toBeCloseTo(p.x * t.scale + t.translateX);
      expect(rn(p).y).toBeCloseTo(p.y * t.scale + t.translateY);
    }
  });
});
