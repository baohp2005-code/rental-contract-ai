/**
 * Chuẩn hóa ảnh trang hợp đồng trước khi đưa vào store, và các kiểm tra chất lượng
 * làm được ngay trên máy.
 *
 * Lưu ý: trong Expo Go không đo được ảnh mờ hay thiếu sáng. Ở đây chỉ kiểm tra
 * kích thước và chiều ảnh, và chỉ đưa ra nhắc nhẹ. Ảnh không đọc được sẽ do backend
 * trả về lỗi `image_unreadable`.
 */
import { MAX_PAGES } from '@rental/shared';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { CapturedPage } from './api/types';

/** Cạnh dài nhất của ảnh sau khi chuẩn hóa (px). */
export const MAX_EDGE = 2000;
/** Chất lượng JPEG khi lưu ảnh đã chuẩn hóa. */
export const JPEG_QUALITY = 0.8;
/** Dưới các ngưỡng này thì chữ trên một trang A4 thường quá nhỏ để đọc. */
export const MIN_LONG_EDGE = 1200;
export const MIN_SHORT_EDGE = 800;
/** Ảnh rộng hơn cao từ tỉ lệ này trở lên thì coi là ảnh nằm ngang. */
const LANDSCAPE_RATIO = 1.15;

export type ImageSize = { width: number; height: number };

/**
 * Kích thước sau khi thu ảnh cho cạnh dài nhất không vượt `maxEdge`, giữ nguyên tỉ lệ.
 * Không phóng to ảnh nhỏ.
 */
export function fitWithin(size: ImageSize, maxEdge: number = MAX_EDGE): ImageSize {
  const longest = Math.max(size.width, size.height);
  if (longest <= maxEdge || longest <= 0) return { width: size.width, height: size.height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

export type QualityIssue = 'too_small' | 'landscape';

/** Lời nhắc cho người dùng. Chỉ là nhắc nhẹ, không chặn việc phân tích. */
export const qualityMessage: Record<QualityIssue, string> = {
  too_small:
    'Ảnh hơi nhỏ nên chữ có thể khó đọc. Ảnh gửi qua Zalo, Messenger thường bị nén. Nếu được, bạn chụp lại bằng camera nhé.',
  landscape:
    'Ảnh đang nằm ngang nên trang giấy có thể bị nhỏ. Nếu chữ khó đọc, bạn chụp lại theo chiều dọc nhé.',
};

/** Các vấn đề nhìn ra được từ kích thước ảnh. Rỗng nghĩa là không thấy gì đáng nhắc. */
export function assessQuality(size: ImageSize): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const longest = Math.max(size.width, size.height);
  const shortest = Math.min(size.width, size.height);
  if (longest < MIN_LONG_EDGE || shortest < MIN_SHORT_EDGE) issues.push('too_small');
  if (size.width > size.height * LANDSCAPE_RATIO) issues.push('landscape');
  return issues;
}

/** Lời nhắc chất lượng của một trang. Ảnh mẫu đi kèm app thì không nhắc. */
export function pageQualityIssues(page: Pick<CapturedPage, 'width' | 'height' | 'origin'>) {
  return page.origin === 'sample' ? [] : assessQuality(page);
}

let idCounter = 0;

/** Id duy nhất cho một trang trong phiên dùng app. */
export function createPageId(): string {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `page-${Date.now().toString(36)}-${idCounter.toString(36)}-${random}`;
}

/** Còn thêm được bao nhiêu trang nữa. */
export function remainingSlots(pageCount: number, maxPages: number = MAX_PAGES): number {
  return Math.max(0, maxPages - pageCount);
}

type AnalysisErrorLike = { code: string; pages?: number[] } | null | undefined;

/**
 * Id của các trang backend báo không đọc được.
 *
 * `error.pages` là số trang (bắt đầu từ 1) theo thứ tự lúc gửi đi, nên phải đối chiếu với
 * `submittedIds` (id các trang đúng thứ tự lúc gửi). Nhờ vậy dấu "Cần chụp lại" vẫn nằm đúng
 * trang khi người dùng đổi thứ tự hoặc xóa trang khác, và tự mất khi trang đó được thay ảnh.
 */
export function retakePageIds(error: AnalysisErrorLike, submittedIds: readonly string[]): string[] {
  if (!error || error.code !== 'image_unreadable' || !error.pages) return [];
  const ids: string[] = [];
  for (const pageNumber of error.pages) {
    const id = Number.isInteger(pageNumber) ? submittedIds[pageNumber - 1] : undefined;
    if (id !== undefined && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Lỗi phân tích mà người dùng sửa được ngay ở màn chụp. Lỗi mạng, máy chủ thì màn phân tích lo. */
const FIXABLE_ON_CAPTURE = ['image_unreadable', 'not_a_contract', 'too_many_pages'];

export type CaptureFeedback = {
  /** Id các trang backend báo không đọc được, còn đang nằm trong danh sách. */
  retakeIds: string[];
  /**
   * Thông báo lỗi chung để hiện ở màn chụp, khi backend không chỉ ra trang cụ thể.
   * Ẩn khi người dùng đã thêm, xóa, thay hoặc đổi thứ tự trang kể từ lúc nhận lỗi.
   */
  message: string | null;
};

/**
 * Màn chụp nên báo gì sau lần phân tích gần nhất.
 * @param error lỗi của lần phân tích gần nhất (null nếu không lỗi)
 * @param submittedIds id các trang theo thứ tự lúc gửi đi
 * @param idsAtError id các trang lúc nhận lỗi
 * @param currentIds id các trang hiện tại
 */
export function captureFeedback(
  error: (NonNullable<AnalysisErrorLike> & { message: string }) | null,
  submittedIds: readonly string[],
  idsAtError: readonly string[],
  currentIds: readonly string[],
): CaptureFeedback {
  if (!error || !FIXABLE_ON_CAPTURE.includes(error.code)) return { retakeIds: [], message: null };
  if (error.code === 'image_unreadable' && error.pages && error.pages.length > 0) {
    const current = new Set(currentIds);
    return {
      retakeIds: retakePageIds(error, submittedIds).filter((id) => current.has(id)),
      message: null,
    };
  }
  const unchanged =
    idsAtError.length === currentIds.length && idsAtError.every((id, i) => id === currentIds[i]);
  return { retakeIds: [], message: unchanged ? error.message : null };
}

/** "2", "2 và 5", "2, 3 và 5": số trang để ghép vào câu tiếng Việt. */
export function formatPageNumbers(numbers: readonly number[]): string {
  if (numbers.length <= 1) return numbers.join('');
  return `${numbers.slice(0, -1).join(', ')} và ${numbers[numbers.length - 1]}`;
}

/**
 * Chia các ảnh người dùng vừa chọn thành phần thêm được và phần bị bỏ vì vượt MAX_PAGES.
 * Giữ nguyên thứ tự chọn.
 */
export function splitByLimit<T>(
  items: readonly T[],
  pageCount: number,
  maxPages: number = MAX_PAGES,
): { accepted: T[]; skipped: number } {
  const slots = remainingSlots(pageCount, maxPages);
  return { accepted: items.slice(0, slots), skipped: Math.max(0, items.length - slots) };
}

/** Phần tài nguyên native cần giải phóng sau khi dùng. */
type Releasable = { release(): void };

/**
 * Thu nhỏ ảnh (cạnh dài nhất tối đa MAX_EDGE), lưu lại dạng JPEG và trả về trang để đưa vào store.
 * `width`/`height` trả về là của tệp đã lưu. Ném lỗi nếu không đọc được ảnh.
 *
 * Chiều xoay theo EXIF được áp vào điểm ảnh khi nạp (Glide trên Android, bước sửa chiều trên iOS),
 * nên ảnh lưu ra luôn đứng đúng chiều dù đã mất EXIF.
 */
export async function normalizeImage(
  uri: string,
  origin: Exclude<CapturedPage['origin'], 'sample'>,
): Promise<CapturedPage> {
  const owned: Releasable[] = [];
  try {
    // Giải mã ảnh ở kích thước đã thu nhỏ để ảnh 50MP không làm đầy bộ nhớ.
    const context = ImageManipulator.manipulate(uri, { maxWidth: MAX_EDGE, maxHeight: MAX_EDGE });
    owned.push(context);
    let image = await context.renderAsync();
    owned.push(image);

    // Phòng khi bộ nạp ảnh của nền tảng không tôn trọng maxWidth/maxHeight.
    const target = fitWithin(image);
    if (target.width !== image.width || target.height !== image.height) {
      const resizeContext = ImageManipulator.manipulate(image).resize(target);
      owned.push(resizeContext);
      image = await resizeContext.renderAsync();
      owned.push(image);
    }

    const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
    return {
      id: createPageId(),
      uri: saved.uri,
      width: saved.width,
      height: saved.height,
      origin,
    };
  } finally {
    // Giải phóng cả khi lỗi giữa chừng; ảnh trước, ngữ cảnh sau.
    for (const ref of owned.reverse()) {
      try {
        ref.release();
      } catch {
        // Đã giải phóng rồi thì thôi.
      }
    }
  }
}
