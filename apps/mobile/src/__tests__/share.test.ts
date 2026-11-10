import { MessageResponseSchema } from '@rental/shared';

import { buildMockMessage } from '@/lib/api/mock';
import {
  buildShareText,
  cleanClauses,
  clausesHeading,
  isEdited,
  normalizeText,
  summarizePoints,
} from '@/lib/share';
import { selectKeptFlags } from '@/lib/store';
import { sampleAnalysis } from '@/mocks/sample-analysis';

// store.ts dùng AsyncStorage; trong test thay bằng bản giả đi kèm thư viện.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('normalizeText', () => {
  it('bỏ \\r, khoảng trắng cuối dòng, dòng trống thừa và khoảng trắng hai đầu', () => {
    expect(normalizeText('  Chào anh ạ.  \r\n\r\n\r\n\r\n1. Hỏi?\t\n  ')).toBe(
      'Chào anh ạ.\n\n1. Hỏi?',
    );
  });

  it('giữ nguyên dấu tiếng Việt và một dòng trống giữa các đoạn', () => {
    const text = 'Em chào anh/chị ạ.\n\n1. Tiền cọc trả lại khi nào ạ?';
    expect(normalizeText(text)).toBe(text);
  });
});

describe('isEdited', () => {
  it('khác biệt chỉ do khoảng trắng thì coi như chưa sửa', () => {
    expect(isEdited('Chào anh ạ.\n', 'Chào anh ạ.')).toBe(false);
    expect(isEdited('Chào anh ạ.\r\n\r\n\r\nCảm ơn', 'Chào anh ạ.\n\nCảm ơn')).toBe(false);
  });

  it('đổi chữ thì là đã sửa', () => {
    expect(isEdited('Chào chị ạ.', 'Chào anh ạ.')).toBe(true);
    expect(isEdited('', 'Chào anh ạ.')).toBe(true);
  });
});

describe('cleanClauses', () => {
  it('bỏ câu rỗng và câu trùng', () => {
    expect(cleanClauses(['  Ghi rõ ngày trả cọc. ', '', '   ', 'Ghi rõ ngày trả cọc.', 'B'])).toEqual(
      ['Ghi rõ ngày trả cọc.', 'B'],
    );
  });
});

describe('clausesHeading', () => {
  it('xưng hô đúng theo lựa chọn', () => {
    expect(clausesHeading('em-anhchi')).toMatch(/^Em /);
    expect(clausesHeading('chau-cochu')).toMatch(/^Cháu /);
  });
});

describe('buildShareText', () => {
  const base = {
    message: 'Em chào anh/chị ạ.\n\n1. Tiền cọc trả lại khi nào ạ?\n',
    clauses: ['Trả cọc trong 7 ngày.', '', 'Báo trước 30 ngày.'],
    addressing: 'em-anhchi' as const,
  };

  it('ghép tin nhắn với các đề nghị, có câu dẫn và gạch đầu dòng', () => {
    expect(buildShareText({ ...base, includeClauses: true })).toBe(
      [
        'Em chào anh/chị ạ.',
        '',
        '1. Tiền cọc trả lại khi nào ạ?',
        '',
        clausesHeading('em-anhchi'),
        '- Trả cọc trong 7 ngày.',
        '- Báo trước 30 ngày.',
      ].join('\n'),
    );
  });

  it('không kèm đề nghị thì chỉ còn tin nhắn đã chuẩn hóa', () => {
    expect(buildShareText({ ...base, includeClauses: false })).toBe(
      'Em chào anh/chị ạ.\n\n1. Tiền cọc trả lại khi nào ạ?',
    );
  });

  it('không có đề nghị nào thì không thêm câu dẫn', () => {
    const text = buildShareText({ ...base, clauses: ['', '  '], includeClauses: true });
    expect(text).not.toContain(clausesHeading('em-anhchi'));
  });

  it('tin nhắn rỗng thì chỉ còn phần đề nghị, không có dòng trống ở đầu', () => {
    const text = buildShareText({ ...base, message: '  ', includeClauses: true });
    expect(text.startsWith(clausesHeading('em-anhchi'))).toBe(true);
  });

  it('không có gì thì trả về chuỗi rỗng', () => {
    expect(buildShareText({ ...base, message: '', clauses: [], includeClauses: true })).toBe('');
  });

  it('chạy đúng với tin nhắn mẫu xưng "cháu – cô/chú"', () => {
    const flags = selectKeptFlags({
      analysis: sampleAnalysis,
      editedQuestions: {},
      decisions: Object.fromEntries(sampleAnalysis.flags.map((f) => [f.id, 'kept' as const])),
    });
    const response = buildMockMessage({
      contract_id: sampleAnalysis.contract_id,
      flags,
      addressing: 'chau-cochu',
      tone: 'direct',
    });
    expect(() => MessageResponseSchema.parse(response)).not.toThrow();

    const text = buildShareText({
      message: response.message,
      clauses: response.suggested_clauses,
      addressing: 'chau-cochu',
      includeClauses: true,
    });
    expect(text.startsWith(normalizeText(response.message))).toBe(true);
    const clauses = cleanClauses(response.suggested_clauses);
    expect(clauses.length).toBeGreaterThan(0);
    expect(text).toContain(clausesHeading('chau-cochu'));
    for (const clause of clauses) expect(text).toContain(`- ${clause}`);
    expect(text).not.toMatch(/\n{3,}/);
  });
});

describe('summarizePoints', () => {
  it('nêu số câu hỏi và số đề nghị', () => {
    expect(summarizePoints(3, 2)).toBe(
      'Tin nhắn hỏi chủ nhà 3 điểm bạn đã giữ lại. Kèm 2 đề nghị ghi thêm vào hợp đồng.',
    );
  });

  it('không có đề nghị thì không nhắc tới', () => {
    expect(summarizePoints(1, 0)).toBe('Tin nhắn hỏi chủ nhà 1 điểm bạn đã giữ lại.');
  });

  it('không có câu hỏi', () => {
    expect(summarizePoints(0, 0)).toBe('Tin nhắn chưa có câu hỏi nào.');
  });
});
