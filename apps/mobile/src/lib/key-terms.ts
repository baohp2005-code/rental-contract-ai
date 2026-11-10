/**
 * Chuyển `key_terms` của kết quả phân tích thành các dòng hiển thị ở màn "Kết quả".
 * Toàn hàm thuần, không đụng tới React, để test được bằng jest.
 */
import type { KeyTerm, KeyTermKey, KeyTerms, TermStatus } from '@rental/shared';

import { formatVnd, keyTermLabel } from '@/lib/format';

export const NOT_FOUND_TEXT = 'Không ghi trong hợp đồng';
export const UNCLEAR_TEXT = 'Ghi không rõ';

/** Giá nước và cách tính nước gộp thành một dòng, nên không có dòng riêng cho `water_unit`. */
export type KeyTermRowKey = Exclude<KeyTermKey, 'water_unit'>;

export type KeyTermRow = {
  key: KeyTermRowKey;
  label: string;
  /**
   * Trạng thái sau khi suy ra, có thể khác trạng thái backend trả về
   * (ví dụ có giá nước nhưng không rõ tính theo người hay theo khối → "unclear").
   * Khác "found" nghĩa là sinh viên nên để ý mục này.
   */
  status: TermStatus;
  /** Dòng chính: con số đã định dạng, hoặc câu báo không ghi / ghi không rõ. */
  value: string;
  /** Dòng phụ, ví dụ "bằng 2 tháng tiền nhà". */
  note?: string;
  /** Chữ nguyên văn trong hợp đồng. Chỉ có khi mục này chưa rõ. */
  rawText?: string;
};

type WaterUnit = NonNullable<KeyTerms['water_unit']['value']>;

const waterUnitSuffix: Record<WaterUnit, string> = {
  per_person: '/người',
  per_m3: '/khối',
};

const waterUnitPhrase: Record<WaterUnit, string> = {
  per_person: 'tính theo người',
  per_m3: 'tính theo khối',
};

/** 12 → "12", 1.5 → "1,5" (số thập phân viết kiểu Việt Nam). */
function formatCount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded).replace('.', ',');
}

/** Con số dùng được: backend báo "found" và giá trị là số không âm. */
function usableNumber(term: KeyTerm<number>): number | null {
  if (term.status !== 'found' || term.value === null) return null;
  return Number.isFinite(term.value) && term.value >= 0 ? term.value : null;
}

/** Dòng cho một mục không có con số dùng được. */
function missingRow(key: KeyTermRowKey, term: KeyTerm<unknown>): KeyTermRow {
  const rawText = term.raw_text.trim();
  // "found" mà không có giá trị là dữ liệu lệch: có chữ thì coi là chưa rõ, không có thì coi là thiếu.
  const unclear = term.status === 'unclear' || (term.status === 'found' && rawText !== '');
  if (!unclear) {
    return { key, label: keyTermLabel[key], status: 'not_found', value: NOT_FOUND_TEXT };
  }
  return {
    key,
    label: keyTermLabel[key],
    status: 'unclear',
    value: UNCLEAR_TEXT,
    ...(rawText ? { rawText } : {}),
  };
}

function numberRow(
  key: KeyTermRowKey,
  term: KeyTerm<number>,
  format: (value: number) => string,
): KeyTermRow {
  const value = usableNumber(term);
  if (value === null) return missingRow(key, term);
  return { key, label: keyTermLabel[key], status: 'found', value: format(value) };
}

/**
 * Chỉ ghi "bằng" khi tiền cọc lệch với số tháng đã làm tròn không quá 0,1% một tháng tiền nhà
 * (3.500đ với tiền thuê 3,5 triệu), để không gọi 6.980.000đ là "bằng 2 tháng" của 3.500.000đ.
 */
const EXACT_TOLERANCE = 0.001;

/**
 * Tiền cọc so với tiền thuê một tháng, vì sinh viên hay so theo cách này.
 * Trả về null khi không so được (thiếu số, hoặc cọc quá nhỏ so với tiền thuê).
 */
export function depositMultipleText(depositVnd: number, rentVnd: number): string | null {
  if (!Number.isFinite(depositVnd) || !Number.isFinite(rentVnd)) return null;
  if (depositVnd <= 0 || rentVnd <= 0) return null;
  const ratio = depositVnd / rentVnd;
  const rounded = Math.round(ratio * 10) / 10;
  if (rounded < 0.1) return null;
  const exact = Math.abs(ratio - rounded) <= EXACT_TOLERANCE;
  return `${exact ? 'bằng' : 'khoảng'} ${formatCount(rounded)} tháng tiền nhà`;
}

function depositRow(terms: KeyTerms): KeyTermRow {
  const row = numberRow('deposit_vnd', terms.deposit_vnd, formatVnd);
  const deposit = usableNumber(terms.deposit_vnd);
  const rent = usableNumber(terms.rent_vnd);
  if (deposit === null || rent === null) return row;
  const note = depositMultipleText(deposit, rent);
  return note ? { ...row, note } : row;
}

function waterRow(terms: KeyTerms): KeyTermRow {
  const key = 'water_vnd';
  const label = keyTermLabel[key];
  const price = usableNumber(terms.water_vnd);
  const unit = terms.water_unit.status === 'found' ? terms.water_unit.value : null;

  if (price === null) {
    const row = missingRow(key, terms.water_vnd);
    if (unit === null) return row;
    if (row.status === 'unclear') {
      // Giá ghi không rõ nhưng cách tính có ghi: giữ lại thông tin cách tính.
      return { ...row, note: `Có ghi ${waterUnitPhrase[unit]}` };
    }
    // Có ghi cách tính nhưng không ghi giá: sinh viên vẫn chưa biết phải trả bao nhiêu.
    const rawText = terms.water_unit.raw_text.trim();
    return {
      key,
      label,
      status: 'unclear',
      value: UNCLEAR_TEXT,
      note: `Có ghi ${waterUnitPhrase[unit]} nhưng không ghi giá`,
      ...(rawText ? { rawText } : {}),
    };
  }

  if (unit === null) {
    // Cùng một con số nhưng theo người hay theo khối thì tiền hằng tháng khác hẳn nhau.
    const rawText = terms.water_vnd.raw_text.trim();
    return {
      key,
      label,
      status: 'unclear',
      value: formatVnd(price),
      note: 'Không rõ tính theo người hay theo khối',
      ...(rawText ? { rawText } : {}),
    };
  }

  return { key, label, status: 'found', value: `${formatVnd(price)}${waterUnitSuffix[unit]}` };
}

/** Các dòng điều khoản chính, theo thứ tự hiển thị: tiền trước, thời gian sau. */
export function buildKeyTermRows(terms: KeyTerms): KeyTermRow[] {
  return [
    numberRow('rent_vnd', terms.rent_vnd, (v) => `${formatVnd(v)}/tháng`),
    depositRow(terms),
    numberRow('electricity_vnd_per_kwh', terms.electricity_vnd_per_kwh, (v) => `${formatVnd(v)}/số`),
    waterRow(terms),
    numberRow('service_fee_vnd', terms.service_fee_vnd, (v) => `${formatVnd(v)}/tháng`),
    numberRow('term_months', terms.term_months, (v) => `${formatCount(v)} tháng`),
    numberRow('notice_days', terms.notice_days, (v) => `${formatCount(v)} ngày`),
  ];
}

/** Số mục hợp đồng không ghi hoặc ghi không rõ. */
export function countTermsNeedingAttention(rows: KeyTermRow[]): number {
  return rows.filter((row) => row.status !== 'found').length;
}
