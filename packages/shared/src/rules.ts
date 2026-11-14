/**
 * Bước B3: kiểm tra theo quy tắc bằng code thuần.
 *
 * Chỉ xử lý các quy tắc `auto: true` trong data/checklist.yaml, là những việc
 * tính được từ key_terms (số tháng cọc, giá điện vượt ngưỡng, thiếu thời hạn
 * báo trước). Kết quả được đưa vào prompt B4 trong <rule_results>; LLM giải
 * thích, không phát hiện lại. Code làm thì ổn định và giải thích được.
 *
 * Hàm thuần, không đọc file: backend tự đọc YAML rồi truyền vào.
 */
import type { FlagType, KeyTerms, LineId } from './index';
import type { Checklist, MarketNorms } from './knowledge';

export type RuleResult = {
  rule_id: string;
  /** true = quy tắc bị vi phạm, phải có cảnh báo. */
  triggered: boolean;
  /** false = không kiểm tra được (thiếu ngưỡng hoặc thiếu số liệu). */
  checked: boolean;
  /** Loại cảnh báo nên dùng nếu triggered. */
  flag_type?: FlagType;
  /** Giải thích ngắn bằng tiếng Việt để LLM dùng lại, kèm con số cụ thể. */
  reason: string;
  line_ids: LineId[];
};

type AutoCheck = (terms: KeyTerms, norms: MarketNorms) => Omit<RuleResult, 'rule_id'>;

const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`;

const skip = (reason: string): Omit<RuleResult, 'rule_id'> => ({
  triggered: false,
  checked: false,
  reason,
  line_ids: [],
});

/** Mỗi quy tắc auto có một hàm kiểm tra. Thêm quy tắc auto mới thì thêm vào đây. */
export const AUTO_CHECKS: Record<string, AutoCheck> = {
  // Cọc cao bất thường so với mặt bằng.
  'DEP-04': (terms, norms) => {
    const rent = terms.rent_vnd;
    const deposit = terms.deposit_vnd;
    const max = norms.deposit_months_max;
    if (max == null) return skip('Chưa có ngưỡng deposit_months_max trong market_norms.yaml');
    if (rent.status !== 'found' || deposit.status !== 'found' || !rent.value || deposit.value == null) {
      return skip('Thiếu tiền thuê hoặc tiền cọc nên không tính được số tháng cọc');
    }
    const months = deposit.value / rent.value;
    const rounded = Math.round(months * 10) / 10;
    return {
      triggered: months > max + 1e-9,
      checked: true,
      flag_type: 'risky',
      reason: `Cọc ${vnd(deposit.value)} = khoảng ${rounded} tháng tiền thuê (${vnd(rent.value)}/tháng); ngưỡng ${max} tháng.`,
      line_ids: unique([...deposit.line_ids, ...rent.line_ids]),
    };
  },

  // Giá điện không ghi số cụ thể, hoặc cao hơn ngưỡng.
  'UTL-01': (terms, norms) => {
    const e = terms.electricity_vnd_per_kwh;
    if (e.status === 'unclear') {
      return {
        triggered: true,
        checked: true,
        flag_type: 'unclear',
        reason: `Giá điện không ghi con số cụ thể: "${e.raw_text}".`,
        line_ids: e.line_ids,
      };
    }
    if (e.status === 'not_found' || e.value == null) {
      return skip('Hợp đồng không nhắc tới giá điện; để LLM đánh giá');
    }
    const max = norms.electricity_max;
    if (max == null) return skip('Chưa có ngưỡng electricity_max trong market_norms.yaml');
    return {
      triggered: e.value > max,
      checked: true,
      flag_type: 'risky',
      reason: `Giá điện ${vnd(e.value)}/số; ngưỡng ${vnd(max)}/số.`,
      line_ids: e.line_ids,
    };
  },

  // Không ghi thời hạn báo trước.
  'TRM-02': (terms) => {
    const n = terms.notice_days;
    if (n.status === 'found') {
      return {
        triggered: false,
        checked: true,
        reason: `Có ghi báo trước ${n.value} ngày.`,
        line_ids: n.line_ids,
      };
    }
    return {
      triggered: true,
      checked: true,
      flag_type: n.status === 'unclear' ? 'unclear' : 'missing',
      reason:
        n.status === 'unclear'
          ? `Thời hạn báo trước ghi không rõ: "${n.raw_text}".`
          : 'Hợp đồng không ghi phải báo trước bao nhiêu ngày khi chấm dứt.',
      line_ids: n.status === 'unclear' ? n.line_ids : [],
    };
  },
};

/** Chạy mọi quy tắc auto có trong checklist. Quy tắc auto chưa có hàm thì bỏ qua. */
export function runRuleChecks(
  terms: KeyTerms,
  checklist: Checklist,
  norms: MarketNorms,
): RuleResult[] {
  return checklist.rules
    .filter((rule) => rule.auto)
    .map((rule) => {
      const check = AUTO_CHECKS[rule.id];
      const result = check
        ? check(terms, norms)
        : skip(`Chưa có code kiểm tra cho ${rule.id} (auto: true trong checklist)`);
      return { rule_id: rule.id, ...result };
    });
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
