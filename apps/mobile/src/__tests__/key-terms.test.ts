import type { KeyTerm, KeyTerms } from '@rental/shared';

import {
  NOT_FOUND_TEXT,
  UNCLEAR_TEXT,
  buildKeyTermRows,
  countTermsNeedingAttention,
  depositMultipleText,
  type KeyTermRow,
  type KeyTermRowKey,
} from '@/lib/key-terms';
import { sampleAnalysis } from '@/mocks/sample-analysis';

const found = <T>(value: T, raw_text = ''): KeyTerm<T> => ({
  value,
  raw_text,
  line_ids: [],
  status: 'found',
});
const notFound = <T>(): KeyTerm<T> => ({
  value: null,
  raw_text: '',
  line_ids: [],
  status: 'not_found',
});
const unclear = <T>(raw_text: string): KeyTerm<T> => ({
  value: null,
  raw_text,
  line_ids: [],
  status: 'unclear',
});

/** Hợp đồng đủ mọi mục; từng test ghi đè mục cần thử. */
function terms(overrides: Partial<KeyTerms> = {}): KeyTerms {
  return {
    rent_vnd: found(3_000_000),
    deposit_vnd: found(3_000_000),
    electricity_vnd_per_kwh: found(3_800),
    water_vnd: found(30_000),
    water_unit: found<'per_person' | 'per_m3'>('per_m3'),
    service_fee_vnd: found(100_000),
    term_months: found(6),
    notice_days: found(30),
    ...overrides,
  };
}

function rowOf(rows: KeyTermRow[], key: KeyTermRowKey): KeyTermRow {
  const row = rows.find((r) => r.key === key);
  if (!row) throw new Error(`Thiếu dòng ${key}`);
  return row;
}

describe('buildKeyTermRows với hợp đồng mẫu', () => {
  const rows = buildKeyTermRows(sampleAnalysis.key_terms);

  it('có đủ 7 dòng theo đúng thứ tự, gộp giá nước với cách tính', () => {
    expect(rows.map((r) => r.key)).toEqual([
      'rent_vnd',
      'deposit_vnd',
      'electricity_vnd_per_kwh',
      'water_vnd',
      'service_fee_vnd',
      'term_months',
      'notice_days',
    ]);
    expect(rows.map((r) => r.label)).toEqual([
      'Tiền thuê',
      'Tiền cọc',
      'Giá điện',
      'Giá nước',
      'Phí dịch vụ',
      'Thời hạn',
      'Báo trước',
    ]);
  });

  it('định dạng các mục đã tìm thấy', () => {
    expect(rowOf(rows, 'rent_vnd')).toMatchObject({ status: 'found', value: '3.500.000đ/tháng' });
    expect(rowOf(rows, 'water_vnd')).toMatchObject({ status: 'found', value: '100.000đ/người' });
    expect(rowOf(rows, 'service_fee_vnd')).toMatchObject({
      status: 'found',
      value: '150.000đ/tháng',
    });
    expect(rowOf(rows, 'term_months')).toMatchObject({ status: 'found', value: '12 tháng' });
  });

  it('ghi tiền cọc kèm số tháng tiền nhà', () => {
    expect(rowOf(rows, 'deposit_vnd')).toEqual({
      key: 'deposit_vnd',
      label: 'Tiền cọc',
      status: 'found',
      value: '7.000.000đ',
      note: 'bằng 2 tháng tiền nhà',
    });
  });

  it('mục ghi không rõ thì kèm chữ nguyên văn', () => {
    expect(rowOf(rows, 'electricity_vnd_per_kwh')).toEqual({
      key: 'electricity_vnd_per_kwh',
      label: 'Giá điện',
      status: 'unclear',
      value: UNCLEAR_TEXT,
      rawText: 'theo giá chủ nhà quy định',
    });
  });

  it('mục không có trong hợp đồng thì báo thiếu', () => {
    expect(rowOf(rows, 'notice_days')).toEqual({
      key: 'notice_days',
      label: 'Báo trước',
      status: 'not_found',
      value: NOT_FOUND_TEXT,
    });
  });

  it('đếm số mục cần để ý', () => {
    expect(countTermsNeedingAttention(rows)).toBe(2);
    expect(countTermsNeedingAttention(buildKeyTermRows(terms()))).toBe(0);
  });
});

describe('buildKeyTermRows với các trường hợp khác', () => {
  it('định dạng giá điện, thời hạn, báo trước', () => {
    const rows = buildKeyTermRows(terms({ term_months: found(1.5) }));
    expect(rowOf(rows, 'electricity_vnd_per_kwh').value).toBe('3.800đ/số');
    expect(rowOf(rows, 'notice_days').value).toBe('30 ngày');
    expect(rowOf(rows, 'term_months').value).toBe('1,5 tháng');
  });

  it('nước tính theo khối', () => {
    const row = rowOf(buildKeyTermRows(terms()), 'water_vnd');
    expect(row).toMatchObject({ status: 'found', value: '30.000đ/khối' });
    expect(row.note).toBeUndefined();
  });

  it('có giá nước nhưng không rõ cách tính thì coi là chưa rõ', () => {
    const row = rowOf(
      buildKeyTermRows(terms({ water_vnd: found(100_000, '100k'), water_unit: notFound() })),
      'water_vnd',
    );
    expect(row).toEqual({
      key: 'water_vnd',
      label: 'Giá nước',
      status: 'unclear',
      value: '100.000đ',
      note: 'Không rõ tính theo người hay theo khối',
      rawText: '100k',
    });
  });

  it('có cách tính nước nhưng không có giá thì coi là chưa rõ', () => {
    const row = rowOf(
      buildKeyTermRows(
        terms({ water_vnd: notFound(), water_unit: found('per_m3', 'tính theo khối') }),
      ),
      'water_vnd',
    );
    expect(row).toMatchObject({
      status: 'unclear',
      value: UNCLEAR_TEXT,
      note: 'Có ghi tính theo khối nhưng không ghi giá',
      rawText: 'tính theo khối',
    });
  });

  it('không ghi cả giá nước lẫn cách tính thì báo thiếu', () => {
    const row = rowOf(
      buildKeyTermRows(terms({ water_vnd: notFound(), water_unit: notFound() })),
      'water_vnd',
    );
    expect(row).toMatchObject({ status: 'not_found', value: NOT_FOUND_TEXT });
    expect(row.note).toBeUndefined();
  });

  it('giá nước ghi không rõ thì giữ chữ nguyên văn của giá nước', () => {
    const row = rowOf(
      buildKeyTermRows(terms({ water_vnd: unclear('theo giá nhà nước') })),
      'water_vnd',
    );
    expect(row).toEqual({
      key: 'water_vnd',
      label: 'Giá nước',
      status: 'unclear',
      value: UNCLEAR_TEXT,
      note: 'Có ghi tính theo khối',
      rawText: 'theo giá nhà nước',
    });

    const noUnit = rowOf(
      buildKeyTermRows(terms({ water_vnd: unclear('theo giá nhà nước'), water_unit: notFound() })),
      'water_vnd',
    );
    expect(noUnit.note).toBeUndefined();
  });

  it('không so tiền cọc khi thiếu tiền thuê hoặc thiếu tiền cọc', () => {
    const noRent = buildKeyTermRows(terms({ rent_vnd: unclear('thỏa thuận sau') }));
    expect(rowOf(noRent, 'deposit_vnd')).toMatchObject({ status: 'found', value: '3.000.000đ' });
    expect(rowOf(noRent, 'deposit_vnd').note).toBeUndefined();

    const noDeposit = buildKeyTermRows(terms({ deposit_vnd: notFound() }));
    expect(rowOf(noDeposit, 'deposit_vnd')).toMatchObject({
      status: 'not_found',
      value: NOT_FOUND_TEXT,
    });
    expect(rowOf(noDeposit, 'deposit_vnd').note).toBeUndefined();
  });

  it('mục ghi không rõ mà không có chữ nguyên văn thì không có rawText', () => {
    const row = rowOf(buildKeyTermRows(terms({ rent_vnd: unclear('  ') })), 'rent_vnd');
    expect(row).toEqual({
      key: 'rent_vnd',
      label: 'Tiền thuê',
      status: 'unclear',
      value: UNCLEAR_TEXT,
    });
  });

  it('không hiện con số khi backend báo "found" mà thiếu giá trị', () => {
    const withText: KeyTerm<number> = { ...found(0, '3tr5'), value: null };
    const withoutText: KeyTerm<number> = { ...found(0), value: null };
    const rows = buildKeyTermRows(terms({ rent_vnd: withText, service_fee_vnd: withoutText }));
    expect(rowOf(rows, 'rent_vnd')).toMatchObject({
      status: 'unclear',
      value: UNCLEAR_TEXT,
      rawText: '3tr5',
    });
    expect(rowOf(rows, 'service_fee_vnd')).toMatchObject({
      status: 'not_found',
      value: NOT_FOUND_TEXT,
    });
  });

  it('không hiện con số âm', () => {
    const row = rowOf(buildKeyTermRows(terms({ notice_days: found(-5, '-5') })), 'notice_days');
    expect(row.status).toBe('unclear');
  });
});

describe('depositMultipleText', () => {
  it('ghi "bằng" khi tròn tháng hoặc tròn nửa tháng', () => {
    expect(depositMultipleText(7_000_000, 3_500_000)).toBe('bằng 2 tháng tiền nhà');
    expect(depositMultipleText(3_500_000, 3_500_000)).toBe('bằng 1 tháng tiền nhà');
    expect(depositMultipleText(5_250_000, 3_500_000)).toBe('bằng 1,5 tháng tiền nhà');
  });

  it('ghi "khoảng" khi không tròn', () => {
    expect(depositMultipleText(5_000_000, 3_500_000)).toBe('khoảng 1,4 tháng tiền nhà');
    expect(depositMultipleText(10_000_000, 3_300_000)).toBe('khoảng 3 tháng tiền nhà');
  });

  it('không ghi "bằng" khi chỉ gần tròn tháng', () => {
    expect(depositMultipleText(6_980_000, 3_500_000)).toBe('khoảng 2 tháng tiền nhà');
    expect(depositMultipleText(7_020_000, 3_500_000)).toBe('khoảng 2 tháng tiền nhà');
    // Phép chia số thực không làm mất chữ "bằng" với số tròn.
    expect(depositMultipleText(3_850_000, 3_500_000)).toBe('bằng 1,1 tháng tiền nhà');
  });

  it('trả về null khi không so được', () => {
    expect(depositMultipleText(7_000_000, 0)).toBeNull();
    expect(depositMultipleText(0, 3_500_000)).toBeNull();
    expect(depositMultipleText(100_000, 3_500_000)).toBeNull();
    expect(depositMultipleText(Number.NaN, 3_500_000)).toBeNull();
  });
});
