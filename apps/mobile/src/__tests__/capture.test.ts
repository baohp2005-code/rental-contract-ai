import { MAX_PAGES } from '@rental/shared';

import { getAnalysisMemory } from '@/components/capture/useAnalysisFeedback';
import type { CapturedPage } from '@/lib/api';

import {
  JPEG_QUALITY,
  captureFeedback,
  MAX_EDGE,
  assessQuality,
  createPageId,
  fitWithin,
  formatPageNumbers,
  normalizeImage,
  pageQualityIssues,
  remainingSlots,
  retakePageIds,
  splitByLimit,
} from '@/lib/capture';
import { useAppStore } from '@/lib/store';

// Store dùng AsyncStorage để lưu việc đồng ý; trong test thay bằng bản giả.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ---------- Giả lập expo-image-manipulator ----------
// Tên biến dùng trong jest.mock phải bắt đầu bằng "mock" (quy định của babel-plugin-jest-hoist).

const mockLog = {
  /** Tên các đối tượng native đã được release, theo thứ tự. */
  released: [] as string[],
  manipulate: [] as { source: unknown; options?: unknown }[],
  resize: [] as unknown[],
  save: [] as unknown[],
  /** Kích thước mà bộ nạp ảnh "giải mã" ra ở lần manipulate đầu tiên. */
  decodedSize: { width: 1500, height: 2000 },
  failSave: false,
};

function mockImage(name: string, width: number, height: number) {
  return {
    width,
    height,
    release: () => mockLog.released.push(name),
    saveAsync: async (options: unknown) => {
      mockLog.save.push(options);
      if (mockLog.failSave) throw new Error('save failed');
      return { uri: `file:///cache/${name}.jpg`, width, height };
    },
  };
}

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  ImageManipulator: {
    manipulate: (source: unknown, options?: unknown) => {
      mockLog.manipulate.push({ source, options });
      const first = typeof source === 'string';
      let size = first ? mockLog.decodedSize : { width: 0, height: 0 };
      const context = {
        resize: (target: { width: number; height: number }) => {
          mockLog.resize.push(target);
          size = target;
          return context;
        },
        renderAsync: async () => mockImage(first ? 'decoded' : 'resized', size.width, size.height),
        release: () => mockLog.released.push(first ? 'context' : 'resize-context'),
      };
      return context;
    },
  },
}));

beforeEach(() => {
  mockLog.released = [];
  mockLog.manipulate = [];
  mockLog.resize = [];
  mockLog.save = [];
  mockLog.decodedSize = { width: 1500, height: 2000 };
  mockLog.failSave = false;
});

// ---------- Hàm thuần ----------

describe('fitWithin', () => {
  it('thu nhỏ theo cạnh dài nhất và giữ tỉ lệ', () => {
    expect(fitWithin({ width: 3000, height: 4000 })).toEqual({ width: 1500, height: 2000 });
    expect(fitWithin({ width: 4032, height: 3024 })).toEqual({ width: 2000, height: 1500 });
  });

  it('không phóng to ảnh nhỏ', () => {
    expect(fitWithin({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
    expect(fitWithin({ width: MAX_EDGE, height: 100 })).toEqual({ width: MAX_EDGE, height: 100 });
  });

  it('cạnh rất mỏng vẫn còn ít nhất 1 px', () => {
    expect(fitWithin({ width: 10000, height: 2 })).toEqual({ width: 2000, height: 1 });
  });
});

describe('assessQuality', () => {
  it('ảnh chụp bình thường thì không nhắc gì', () => {
    expect(assessQuality({ width: 1500, height: 2000 })).toEqual([]);
  });

  it('nhắc khi ảnh quá nhỏ', () => {
    expect(assessQuality({ width: 600, height: 800 })).toEqual(['too_small']);
    // Cạnh dài đủ nhưng cạnh ngắn quá hẹp.
    expect(assessQuality({ width: 700, height: 1600 })).toEqual(['too_small']);
  });

  it('nhắc khi ảnh nằm ngang', () => {
    expect(assessQuality({ width: 2000, height: 1500 })).toEqual(['landscape']);
    // Gần vuông thì không nhắc.
    expect(assessQuality({ width: 1600, height: 1500 })).toEqual([]);
  });

  it('có thể có cả hai lời nhắc', () => {
    expect(assessQuality({ width: 1000, height: 600 })).toEqual(['too_small', 'landscape']);
  });
});

describe('pageQualityIssues', () => {
  it('không nhắc với ảnh hợp đồng mẫu', () => {
    expect(pageQualityIssues({ width: 100, height: 100, origin: 'sample' })).toEqual([]);
    expect(pageQualityIssues({ width: 100, height: 100, origin: 'library' })).toEqual([
      'too_small',
    ]);
  });
});

describe('createPageId', () => {
  it('không trùng nhau dù gọi liên tục', () => {
    const ids = new Set(Array.from({ length: 500 }, () => createPageId()));
    expect(ids.size).toBe(500);
  });
});

describe('giới hạn số trang', () => {
  it('remainingSlots không âm', () => {
    expect(remainingSlots(0)).toBe(MAX_PAGES);
    expect(remainingSlots(MAX_PAGES)).toBe(0);
    expect(remainingSlots(MAX_PAGES + 3)).toBe(0);
  });

  it('splitByLimit giữ thứ tự và đếm số ảnh bị bỏ', () => {
    expect(splitByLimit(['a', 'b', 'c'], 0, 8)).toEqual({ accepted: ['a', 'b', 'c'], skipped: 0 });
    expect(splitByLimit(['a', 'b', 'c'], 6, 8)).toEqual({ accepted: ['a', 'b'], skipped: 1 });
    expect(splitByLimit(['a'], 8, 8)).toEqual({ accepted: [], skipped: 1 });
  });
});

describe('formatPageNumbers', () => {
  it('ghép số trang thành câu tiếng Việt', () => {
    expect(formatPageNumbers([])).toBe('');
    expect(formatPageNumbers([2])).toBe('2');
    expect(formatPageNumbers([2, 5])).toBe('2 và 5');
    expect(formatPageNumbers([1, 3, 4])).toBe('1, 3 và 4');
  });
});

describe('retakePageIds', () => {
  const submitted = ['p1', 'p2', 'p3'];

  it('đổi số trang (bắt đầu từ 1) thành id theo thứ tự lúc gửi', () => {
    expect(retakePageIds({ code: 'image_unreadable', pages: [2, 3] }, submitted)).toEqual([
      'p2',
      'p3',
    ]);
  });

  it('bỏ qua số trang không hợp lệ và trùng lặp', () => {
    expect(
      retakePageIds({ code: 'image_unreadable', pages: [0, 2, 2, 9, 1.5, -1] }, submitted),
    ).toEqual(['p2']);
  });

  it('chỉ áp dụng cho lỗi image_unreadable có danh sách trang', () => {
    expect(retakePageIds({ code: 'not_a_contract', pages: [1] }, submitted)).toEqual([]);
    expect(retakePageIds({ code: 'image_unreadable' }, submitted)).toEqual([]);
    expect(retakePageIds(null, submitted)).toEqual([]);
  });
});

// ---------- normalizeImage ----------

describe('normalizeImage', () => {
  it('giải mã có giới hạn cạnh, lưu JPEG và trả về kích thước của tệp đã lưu', async () => {
    const page = await normalizeImage('file:///photo.jpg', 'camera');

    expect(mockLog.manipulate[0]).toEqual({
      source: 'file:///photo.jpg',
      options: { maxWidth: MAX_EDGE, maxHeight: MAX_EDGE },
    });
    expect(mockLog.resize).toEqual([]);
    expect(mockLog.save).toEqual([{ compress: JPEG_QUALITY, format: 'jpeg' }]);
    expect(page).toMatchObject({
      uri: 'file:///cache/decoded.jpg',
      width: 1500,
      height: 2000,
      origin: 'camera',
    });
    expect(page.id).toEqual(expect.any(String));
    // Ảnh trước, ngữ cảnh sau, và không sót cái nào.
    expect(mockLog.released).toEqual(['decoded', 'context']);
  });

  it('mỗi ảnh có id riêng', async () => {
    const a = await normalizeImage('file:///a.jpg', 'library');
    const b = await normalizeImage('file:///a.jpg', 'library');
    expect(a.origin).toBe('library');
    expect(a.id).not.toBe(b.id);
  });

  it('tự thu nhỏ thêm nếu bộ nạp ảnh bỏ qua giới hạn cạnh', async () => {
    mockLog.decodedSize = { width: 3000, height: 4000 };
    const page = await normalizeImage('file:///big.jpg', 'library');

    expect(mockLog.resize).toEqual([{ width: 1500, height: 2000 }]);
    expect(page).toMatchObject({ uri: 'file:///cache/resized.jpg', width: 1500, height: 2000 });
    expect(mockLog.released).toEqual(['resized', 'resize-context', 'decoded', 'context']);
  });

  it('vẫn giải phóng bộ nhớ khi lưu ảnh lỗi', async () => {
    mockLog.failSave = true;
    await expect(normalizeImage('file:///photo.jpg', 'camera')).rejects.toThrow('save failed');
    expect(mockLog.released).toEqual(['decoded', 'context']);
  });
});

// ---------- Phản hồi sau phân tích ----------

describe('captureFeedback', () => {
  const unreadable = {
    code: 'image_unreadable',
    message: 'Ảnh quá mờ',
    pages: [2],
  };

  it('đánh dấu đúng trang dù người dùng đã đổi thứ tự', () => {
    const result = captureFeedback(unreadable, ['a', 'b', 'c'], ['a', 'b', 'c'], ['b', 'a', 'c']);
    expect(result).toEqual({ retakeIds: ['b'], message: null });
  });

  it('trang đã được thay ảnh (id mới) thì hết dấu', () => {
    const result = captureFeedback(unreadable, ['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'x', 'c']);
    expect(result).toEqual({ retakeIds: [], message: null });
  });

  it('lỗi không chỉ ra trang: hiện thông báo cho tới khi người dùng sửa danh sách', () => {
    const error = { code: 'not_a_contract', message: 'Không phải hợp đồng' };
    expect(captureFeedback(error, ['a'], ['a'], ['a']).message).toBe('Không phải hợp đồng');
    expect(captureFeedback(error, ['a'], ['a'], ['a', 'b']).message).toBeNull();
    const noPages = { code: 'image_unreadable', message: 'Ảnh quá mờ' };
    expect(captureFeedback(noPages, ['a'], ['a'], ['a']).message).toBe('Ảnh quá mờ');
  });

  it('không báo lỗi mạng hay máy chủ ở màn chụp', () => {
    const error = { code: 'network', message: 'Mất mạng' };
    expect(captureFeedback(error, ['a'], ['a'], ['a'])).toEqual({ retakeIds: [], message: null });
    expect(captureFeedback(null, ['a'], ['a'], ['a'])).toEqual({ retakeIds: [], message: null });
  });
});

describe('ghi nhớ lỗi phân tích qua store', () => {
  const page = (id: string): CapturedPage => ({
    id,
    uri: `file:///${id}.jpg`,
    width: 1500,
    height: 2000,
    origin: 'camera',
  });

  it('vẫn nhớ trang cần chụp lại sau khi màn phân tích gọi cancelAnalysis()', () => {
    useAppStore.setState({ pages: [page('a'), page('b')], analysisStatus: 'idle' });

    useAppStore.setState({ analysisStatus: 'running' });
    expect(getAnalysisMemory().submittedIds).toEqual(['a', 'b']);

    const error = { code: 'image_unreadable' as const, message: 'Ảnh quá mờ', pages: [2] };
    useAppStore.setState({ analysisStatus: 'error', analysisError: error });
    useAppStore.getState().cancelAnalysis();
    // Store giờ giữ lỗi sau khi hủy; bộ nhớ riêng của màn chụp vẫn phải đúng.
    expect(useAppStore.getState().analysisError).toEqual(error);

    const memory = getAnalysisMemory();
    expect(memory.error).toEqual(error);
    expect(
      captureFeedback(memory.error, memory.submittedIds, memory.idsAtError, ['b', 'a']).retakeIds,
    ).toEqual(['b']);

    // Phân tích lại thì quên lỗi cũ.
    useAppStore.setState({ analysisStatus: 'running' });
    expect(getAnalysisMemory().error).toBeNull();
  });
});
