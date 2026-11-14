/**
 * Đọc số tiền trong chữ hợp đồng và so chữ số giữa hai bản chữ.
 *
 * Dùng cho: kiểm tra AI không sửa sai số tiền (B2), và chế độ không AI.
 */

export type MoneyMatch = { value: number; raw: string; index: number };

const UNIT = String.raw`(triệu|tr|nghìn|ngàn|ngan|nghin|k|vnđ|vnd|đồng|dong|đ)`;
// 3.500.000 | 3,500,000 | 3 500 000 | 3,5 | 3.5 | 3500
const NUM = String.raw`(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d{1,2})?)`;
const MONEY_RE = new RegExp(String.raw`${NUM}\s*${UNIT}?(\d{1,3})?(?![\p{L}\d])`, 'giu');

function toNumber(raw: string): number {
  const compact = raw.replace(/\s/g, '');
  // Nhóm nghìn: 3.500.000 hoặc 3,500,000
  if (/^\d{1,3}([.,]\d{3})+$/.test(compact)) return Number(compact.replace(/[.,]/g, ''));
  // Số thập phân: 3,5 hoặc 3.5
  return Number(compact.replace(',', '.'));
}

/**
 * Tìm mọi số tiền trong một đoạn chữ. Chỉ nhận là tiền khi có đơn vị
 * (đồng, đ, k, tr, triệu, nghìn) hoặc giá trị từ 1.000 trở lên, để không
 * lẫn với "ngày 05", "phòng số 203".
 *   "3.500.000 đồng" → 3500000 · "3,5 triệu" → 3500000 · "3tr5" → 3500000
 *   "3k8" → 3800 · "3.800đ/số" → 3800
 */
export function findMoney(text: string): MoneyMatch[] {
  const out: MoneyMatch[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const [raw, num, unitRaw, tail] = m;
    const unit = unitRaw?.toLowerCase();
    let value = toNumber(num);
    if (!Number.isFinite(value)) continue;
    if (unit === 'triệu' || unit === 'tr') {
      value = value * 1_000_000 + (tail ? Number(tail.padEnd(1, '0')) * 10 ** (6 - tail.length) : 0);
    } else if (unit === 'k' || unit === 'nghìn' || unit === 'ngàn' || unit === 'ngan' || unit === 'nghin') {
      value = value * 1_000 + (tail ? Number(tail) * 10 ** (3 - tail.length) : 0);
    } else if (tail) {
      continue; // "12 3" không phải tiền
    }
    if (!unit && value < 1000) continue;
    out.push({ value: Math.round(value), raw: raw.trim(), index: m.index ?? 0 });
  }
  return out;
}

/**
 * Sửa vài lỗi OCR hay gặp trong con số trước khi so: chữ O/o đứng cạnh chữ
 * số là số 0, chữ l/I là số 1 ("3.5OO.OOO" → "3.500.000").
 */
function fixOcrDigits(text: string): string {
  let prev: string;
  let s = text;
  do {
    prev = s;
    s = s.replace(/(?<=[\d.,])[Oo]|[Oo](?=[\d.,]\d)/g, '0').replace(/(?<=[\d.,])[lI|]|[lI|](?=[\d.,]\d)/g, '1');
  } while (s !== prev);
  return s;
}

/** Dãy các con số trong chữ, bỏ dấu phân cách: "3.500.000 đồng, ngày 05" → "3500000|05". */
export function digitSignature(text: string): string {
  return (fixOcrDigits(text).match(/\d+(?:[.,\s]\d{3})*/g) ?? [])
    .map((n) => n.replace(/[.,\s]/g, ''))
    .join('|');
}

/** Hai bản chữ có đúng cùng các con số theo cùng thứ tự không. */
export function sameDigits(a: string, b: string): boolean {
  return digitSignature(a) === digitSignature(b);
}
