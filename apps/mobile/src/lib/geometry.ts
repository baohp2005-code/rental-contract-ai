/**
 * Hình học cho việc tô dòng hợp đồng trên ảnh. Toàn hàm thuần, không phụ thuộc React.
 *
 * Quy ước:
 * - `BBox` chuẩn hóa 0..1 theo ảnh trang (x, y là góc trên-trái), đúng như backend trả về.
 * - "content" là khung ảnh khi hiển thị ở tỉ lệ 1 (đúng tỉ lệ khung hình của ảnh).
 * - `ViewTransform` đưa một điểm p trong content ra màn hình: màn hình = p * scale + translate,
 *   gốc ở góc trên-trái của khung nhìn (viewport).
 *
 * Các hàm có chỉ thị 'worklet' được gọi cả trên luồng UI (trong cử chỉ phóng to/kéo).
 */
import type { BBox } from '@rental/shared';

export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type ViewTransform = { scale: number; translateX: number; translateY: number };
export type Point = { x: number; y: number };

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  if (min > max) return (min + max) / 2;
  return Math.min(Math.max(value, min), max);
}

/** Đưa bbox về trong ảnh (0..1), kể cả khi dữ liệu lệch ra ngoài mép. */
export function clampBBox(b: BBox): BBox {
  const x = clamp(b.x, 0, 1);
  const y = clamp(b.y, 0, 1);
  return {
    x,
    y,
    w: clamp(b.w, 0, 1 - x),
    h: clamp(b.h, 0, 1 - y),
  };
}

/** Bbox chuẩn hóa → hình chữ nhật (px) trên ảnh đang hiển thị ở kích thước `displayed`. */
export function bboxToRect(b: BBox, displayed: Size): Rect {
  const c = clampBBox(b);
  return {
    x: c.x * displayed.width,
    y: c.y * displayed.height,
    width: c.w * displayed.width,
    height: c.h * displayed.height,
  };
}

/** Hộp nhỏ nhất chứa mọi hộp. null nếu danh sách rỗng. */
export function unionBBox(boxes: readonly BBox[]): BBox | null {
  if (boxes.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const raw of boxes) {
    const b = clampBBox(raw);
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Nới hộp ra mỗi phía (đơn vị chuẩn hóa), không vượt quá mép ảnh. */
export function padBBox(b: BBox, padX: number, padY: number): BBox {
  const x1 = clamp(b.x - padX, 0, 1);
  const y1 = clamp(b.y - padY, 0, 1);
  const x2 = clamp(b.x + b.w + padX, 0, 1);
  const y2 = clamp(b.y + b.h + padY, 0, 1);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * Vùng cần nhìn thấy khi xem tập trung: các dòng được tô cộng thêm chút ngữ cảnh.
 * Ngữ cảnh dọc tính theo chiều cao dòng (khoảng hơn một dòng phía trên và dưới),
 * nên không phụ thuộc ảnh dọc hay ngang.
 */
export function focusRegion(boxes: readonly BBox[]): BBox | null {
  const union = unionBBox(boxes);
  if (!union) return null;
  const lineHeight = Math.max(...boxes.map((b) => clampBBox(b).h), 0.005);
  return padBBox(union, 0.04, Math.max(lineHeight * 1.4, 0.02));
}

/** Đặt ảnh `image` vừa trong khung `container` (giữ tỉ lệ, căn giữa). */
export function fitContain(image: Size, container: Size): Rect {
  if (image.width <= 0 || image.height <= 0) {
    return { x: 0, y: 0, width: container.width, height: container.height };
  }
  const s = Math.min(container.width / image.width, container.height / image.height);
  const width = image.width * s;
  const height = image.height * s;
  return { x: (container.width - width) / 2, y: (container.height - height) / 2, width, height };
}

/** Kích thước content khi ảnh được kéo vừa chiều rộng `width`. */
export function fitWidth(image: Size, width: number): Size {
  if (image.width <= 0 || image.height <= 0) return { width, height: width };
  return { width, height: (width * image.height) / image.width };
}

/**
 * Khoảng dịch hợp lệ ở mức phóng `scale` (xem clampTransform).
 * Trục nào ảnh nhỏ hơn khung thì min = max = vị trí căn giữa.
 *
 * LƯU Ý: plugin worklets biến các hàm 'worklet' thành biến gán theo thứ tự trong file,
 * nên hàm worklet được gọi bởi worklet khác phải khai báo TRƯỚC hàm gọi nó.
 */
export function translateBounds(
  scale: number,
  content: Size,
  viewport: Size,
): { minX: number; maxX: number; minY: number; maxY: number } {
  'worklet';
  const w = content.width * scale;
  const h = content.height * scale;
  const cx = (viewport.width - w) / 2;
  const cy = (viewport.height - h) / 2;
  return {
    minX: w <= viewport.width ? cx : viewport.width - w,
    maxX: w <= viewport.width ? cx : 0,
    minY: h <= viewport.height ? cy : viewport.height - h,
    maxY: h <= viewport.height ? cy : 0,
  };
}

/**
 * Giữ ảnh luôn phủ khung nhìn: khi ảnh (đã phóng) lớn hơn khung thì không để lộ
 * khoảng trống ở mép; khi nhỏ hơn thì căn giữa. Không đổi `scale`.
 */
export function clampTransform(t: ViewTransform, content: Size, viewport: Size): ViewTransform {
  'worklet';
  const b = translateBounds(t.scale, content, viewport);
  return {
    scale: t.scale,
    translateX: clamp(t.translateX, b.minX, b.maxX),
    translateY: clamp(t.translateY, b.minY, b.maxY),
  };
}

/**
 * Phóng to/thu nhỏ tới `newScale` mà điểm `focal` (tọa độ khung nhìn) đứng yên.
 * Dùng cho chụm hai ngón và chạm hai lần.
 */
export function zoomAround(t: ViewTransform, focal: Point, newScale: number): ViewTransform {
  'worklet';
  const px = (focal.x - t.translateX) / t.scale;
  const py = (focal.y - t.translateY) / t.scale;
  return {
    scale: newScale,
    translateX: focal.x - px * newScale,
    translateY: focal.y - py * newScale,
  };
}

/**
 * Phép biến đổi đưa vùng `region` vào giữa khung nhìn, to nhất có thể mà vẫn
 * thấy trọn vùng, trong giới hạn [minScale, maxScale]. Kết quả đã qua clampTransform,
 * nên một dòng sát mép trang sẽ không nằm giữa nhưng vẫn nằm trong khung.
 */
export function focusTransform(
  region: BBox,
  content: Size,
  viewport: Size,
  limits: { minScale: number; maxScale: number },
): ViewTransform {
  const r = bboxToRect(region, content);
  const sx = r.width > 0 ? viewport.width / r.width : limits.maxScale;
  const sy = r.height > 0 ? viewport.height / r.height : limits.maxScale;
  const scale = clamp(Math.min(sx, sy), limits.minScale, limits.maxScale);
  return clampTransform(
    {
      scale,
      translateX: viewport.width / 2 - (r.x + r.width / 2) * scale,
      translateY: viewport.height / 2 - (r.y + r.height / 2) * scale,
    },
    content,
    viewport,
  );
}

/**
 * Chiều cao khung xem tập trung (ở màn chi tiết) có chiều rộng `width`:
 * đủ để vùng `region` hiện trọn khi kéo vừa chiều rộng, trong giới hạn [min, max].
 * Ảnh được hiển thị vừa chiều rộng (content = fitWidth) và phóng tối đa `maxScale`.
 */
export function focusViewportHeight(
  region: BBox,
  image: Size,
  width: number,
  limits: { minHeight: number; maxHeight: number; maxScale: number },
): number {
  const content = fitWidth(image, width);
  const r = bboxToRect(region, content);
  const scale = r.width > 0 ? clamp(width / r.width, 1, limits.maxScale) : 1;
  // Không cao hơn cả trang ảnh ở tỉ lệ 1 (ảnh ngang rất thấp).
  const maxHeight = Math.min(limits.maxHeight, content.height * scale);
  return clamp(r.height * scale, Math.min(limits.minHeight, maxHeight), maxHeight);
}

/**
 * React Native phóng (`scale`) quanh tâm của view. Hàm này đổi phép biến đổi
 * gốc trên-trái của ta sang dịch chuyển tương ứng khi phóng quanh tâm,
 * cho view nội dung kích thước `content` đặt tại (0, 0).
 */
export function toCenterOriginTranslate(t: ViewTransform, content: Size): Point {
  'worklet';
  return {
    x: t.translateX + ((t.scale - 1) * content.width) / 2,
    y: t.translateY + ((t.scale - 1) * content.height) / 2,
  };
}

/** Áp phép biến đổi lên một hình chữ nhật trong content → tọa độ khung nhìn. */
export function applyTransform(rect: Rect, t: ViewTransform): Rect {
  return {
    x: rect.x * t.scale + t.translateX,
    y: rect.y * t.scale + t.translateY,
    width: rect.width * t.scale,
    height: rect.height * t.scale,
  };
}
