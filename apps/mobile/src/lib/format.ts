import type {
  Addressing,
  Category,
  FlagType,
  KeyTermKey,
  Severity,
  Tone,
} from '@rental/shared';

/** 3500000 → "3.500.000đ" */
export function formatVnd(value: number): string {
  const rounded = Math.round(value);
  const digits = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${rounded < 0 ? '-' : ''}${digits}đ`;
}

export const severityLabel: Record<Severity, string> = {
  high: 'Rủi ro cao',
  medium: 'Nên hỏi lại',
  low: 'Nên làm rõ',
};

/** Thứ tự hiển thị: nghiêm trọng nhất trước. */
export const severityOrder: Severity[] = ['high', 'medium', 'low'];

export const flagTypeLabel: Record<FlagType, string> = {
  risky: 'Điều khoản bất lợi',
  missing: 'Thiếu trong hợp đồng',
  unclear: 'Chưa rõ ràng',
};

export const categoryLabel: Record<Category, string> = {
  deposit: 'Tiền cọc',
  utilities: 'Điện nước',
  rent: 'Tiền thuê',
  repairs: 'Sửa chữa',
  termination: 'Chấm dứt hợp đồng',
  other: 'Khác',
};

export const keyTermLabel: Record<KeyTermKey, string> = {
  rent_vnd: 'Tiền thuê',
  deposit_vnd: 'Tiền cọc',
  electricity_vnd_per_kwh: 'Giá điện',
  water_vnd: 'Giá nước',
  water_unit: 'Cách tính nước',
  service_fee_vnd: 'Phí dịch vụ',
  term_months: 'Thời hạn',
  notice_days: 'Báo trước',
};

export const addressingLabel: Record<Addressing, string> = {
  'em-anhchi': 'Em – anh/chị',
  'chau-cochu': 'Cháu – cô/chú',
};

export const toneLabel: Record<Tone, string> = {
  gentle: 'Nhẹ nhàng',
  direct: 'Thẳng thắn',
};
