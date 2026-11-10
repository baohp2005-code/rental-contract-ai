import { AnalyzeResponseSchema, MessageResponseSchema } from '@rental/shared';

import { applyAddressing, buildMockMessage } from '@/lib/api/mock';
import { formatVnd } from '@/lib/format';
import {
  selectKeptFlags,
  selectNextPendingFlag,
  selectReviewProgress,
  selectSortedFlags,
} from '@/lib/store';
import { sampleAnalysis } from '@/mocks/sample-analysis';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('formatVnd', () => {
  it('chèn dấu chấm hàng nghìn', () => {
    expect(formatVnd(3500000)).toBe('3.500.000đ');
    expect(formatVnd(3800)).toBe('3.800đ');
    expect(formatVnd(0)).toBe('0đ');
  });
});

describe('dữ liệu mẫu', () => {
  it('đúng schema dùng chung', () => {
    expect(() => AnalyzeResponseSchema.parse(sampleAnalysis)).not.toThrow();
  });

  it('mọi line_ids của cảnh báo đều tồn tại, và quote nằm trong chữ của dòng', () => {
    const lines = new Map(sampleAnalysis.lines.map((l) => [l.id, l.text]));
    for (const flag of sampleAnalysis.flags) {
      if (flag.type === 'missing') {
        expect(flag.line_ids).toEqual([]);
        continue;
      }
      expect(flag.line_ids.length).toBeGreaterThan(0);
      const text = flag.line_ids.map((id) => lines.get(id)).join(' ');
      expect(text).toContain(flag.quote);
    }
  });
});

describe('selector', () => {
  const base = { analysis: sampleAnalysis, editedQuestions: {} };

  it('xếp cảnh báo nghiêm trọng nhất trước', () => {
    const severities = selectSortedFlags(base).map((f) => f.severity);
    expect(severities.indexOf('medium')).toBeGreaterThan(severities.lastIndexOf('high'));
    expect(severities.indexOf('low')).toBeGreaterThan(severities.lastIndexOf('medium'));
  });

  it('chỉ gửi cảnh báo đã giữ, dùng câu hỏi đã sửa', () => {
    const kept = selectKeptFlags({
      ...base,
      decisions: { F1: 'kept', F2: 'dropped', F3: 'kept' },
      editedQuestions: { F3: '  Giá có giữ nguyên không ạ?  ' },
    });
    expect(kept.map((f) => f.id)).toEqual(['F1', 'F3']);
    expect(kept[1].question_for_landlord).toBe('Giá có giữ nguyên không ạ?');
  });

  it('đếm tiến độ duyệt', () => {
    const progress = selectReviewProgress({ ...base, decisions: { F1: 'kept', F2: 'dropped' } });
    expect(progress.total).toBe(sampleAnalysis.flags.length);
    expect(progress.kept).toBe(1);
    expect(progress.dropped).toBe(1);
    expect(progress.pending).toBe(progress.total - 2);
  });

  it('tìm cảnh báo chưa duyệt kế tiếp, không trả lại chính nó', () => {
    const sorted = selectSortedFlags(base);
    const decisions = Object.fromEntries(sorted.map((f) => [f.id, 'kept' as const]));
    const state = { ...base, decisions: { ...decisions, [sorted[0].id]: 'pending' as const } };
    expect(selectNextPendingFlag(state, sorted[2].id)?.id).toBe(sorted[0].id);
    expect(selectNextPendingFlag(state, sorted[0].id)).toBeUndefined();
  });
});

describe('tin nhắn mẫu', () => {
  it('đổi cách xưng hô mà không làm hỏng từ khác', () => {
    const out = applyAddressing('Anh/chị cho em xem giấy tờ, em đem theo ạ?', 'chau-cochu');
    expect(out).toBe('Cô/chú cho cháu xem giấy tờ, cháu đem theo ạ?');
  });

  it('đúng schema và đánh số đủ câu hỏi', () => {
    const flags = selectKeptFlags({
      analysis: sampleAnalysis,
      editedQuestions: {},
      decisions: { F1: 'kept', F7: 'kept' },
    });
    const message = buildMockMessage({
      contract_id: 'mau-001',
      flags,
      addressing: 'em-anhchi',
      tone: 'gentle',
    });
    expect(() => MessageResponseSchema.parse(message)).not.toThrow();
    expect(message.questions).toHaveLength(2);
    expect(message.message).toContain('2. ');
  });
});
