/**
 * Sao chép và chia sẻ tin nhắn gửi chủ nhà.
 *
 * Ứng dụng KHÔNG tự gửi gì: sao chép chỉ đưa chữ vào bộ nhớ tạm, chia sẻ chỉ
 * mở bảng chia sẻ của hệ thống để sinh viên tự chọn Zalo (hay app khác) và tự bấm gửi.
 *
 * Phần đầu file là hàm thuần (có test ở src/__tests__/share.test.ts).
 */
import type { Addressing } from '@rental/shared';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Share } from 'react-native';

// ---------- Hàm thuần ----------

const selfPronoun: Record<Addressing, string> = {
  'em-anhchi': 'Em',
  'chau-cochu': 'Cháu',
};

/**
 * Chuẩn hóa chữ trước khi so sánh hoặc gửi đi: bỏ \r, bỏ khoảng trắng cuối dòng,
 * gộp nhiều dòng trống liền nhau thành một, cắt khoảng trắng hai đầu.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Sinh viên đã sửa bản nháp chưa (bỏ qua khác biệt chỉ do khoảng trắng). */
export function isEdited(draft: string, original: string): boolean {
  return normalizeText(draft) !== normalizeText(original);
}

/** Bỏ câu đề nghị rỗng hoặc trùng nhau. */
export function cleanClauses(clauses: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const clause of clauses) {
    const c = normalizeText(clause);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/** Câu dẫn trước danh sách đề nghị ghi thêm vào hợp đồng, theo cách xưng hô. */
export function clausesHeading(addressing: Addressing): string {
  return `${selfPronoun[addressing]} đề nghị ghi thêm vào hợp đồng mấy ý sau ạ:`;
}

export type ShareTextInput = {
  /** Tin nhắn (bản sinh viên đã sửa nếu có). */
  message: string;
  clauses: readonly string[];
  addressing: Addressing;
  /** Có kèm các đề nghị ghi thêm vào hợp đồng không. */
  includeClauses: boolean;
};

/**
 * Ghép tin nhắn và (nếu chọn) các đề nghị ghi thêm vào hợp đồng thành một
 * đoạn chữ để sao chép hoặc chia sẻ. Trả về chuỗi rỗng nếu không có gì để gửi.
 */
export function buildShareText({
  message,
  clauses,
  addressing,
  includeClauses,
}: ShareTextInput): string {
  const body = normalizeText(message);
  const list = includeClauses ? cleanClauses(clauses) : [];
  if (list.length === 0) return body;
  const block = [clausesHeading(addressing), ...list.map((c) => `- ${c}`)].join('\n');
  return body ? `${body}\n\n${block}` : block;
}

/** Câu tóm tắt tin nhắn hỏi mấy điểm. */
export function summarizePoints(questionCount: number, clauseCount: number): string {
  const questions =
    questionCount > 0
      ? `Tin nhắn hỏi chủ nhà ${questionCount} điểm bạn đã giữ lại.`
      : 'Tin nhắn chưa có câu hỏi nào.';
  if (clauseCount <= 0) return questions;
  return `${questions} Kèm ${clauseCount} đề nghị ghi thêm vào hợp đồng.`;
}

// ---------- Sao chép / chia sẻ (có tác dụng phụ) ----------

/** Rung nhẹ báo thành công. Máy không hỗ trợ rung thì bỏ qua. */
function successHaptic(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Đưa chữ vào bộ nhớ tạm. Trả về false nếu không có chữ hoặc bị lỗi. */
export async function copyText(text: string): Promise<boolean> {
  const value = normalizeText(text);
  if (!value) return false;
  try {
    await Clipboard.setStringAsync(value);
    successHaptic();
    return true;
  } catch {
    return false;
  }
}

/**
 * - shared: người dùng đã chọn một app (Android luôn trả về kết quả này, kể cả khi đóng bảng).
 * - dismissed: người dùng đóng bảng chia sẻ (chỉ iOS báo được).
 * - failed: không mở được bảng chia sẻ.
 */
export type ShareOutcome = 'shared' | 'dismissed' | 'failed';

/** Mở bảng chia sẻ của hệ thống. Người dùng tự chọn app và tự bấm gửi. */
export async function shareText(text: string): Promise<ShareOutcome> {
  const value = normalizeText(text);
  if (!value) return 'failed';
  try {
    const result = await Share.share(
      { message: value },
      { dialogTitle: 'Gửi tin nhắn cho chủ nhà qua…' },
    );
    return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
  } catch {
    return 'failed';
  }
}
