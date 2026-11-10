import { useSyncExternalStore } from 'react';

import { captureFeedback, type CaptureFeedback } from '@/lib/capture';
import { useAppStore, type AppError } from '@/lib/store';

/**
 * Ghi nhớ kết quả lần phân tích gần nhất để màn chụp chỉ ra trang cần chụp lại.
 *
 * Vì sao không đọc thẳng `analysisError` trong store: màn "Đang phân tích" gọi `cancelAnalysis()`
 * khi đưa người dùng về màn chụp, và hàm này xóa `analysisError`. Nên ở đây tự lắng nghe store:
 * - khi phân tích bắt đầu: ghi lại id các trang theo đúng thứ tự gửi đi, xóa lỗi cũ;
 * - khi có lỗi: giữ lại lỗi và danh sách trang lúc đó;
 * - khi phân tích xong hoặc danh sách trang bị xóa hết (reset): quên lỗi.
 *
 * Backend báo trang hỏng bằng số trang (1, 2, ...) theo thứ tự lúc gửi, nên đổi sang id ngay.
 * Nhờ vậy người dùng đổi thứ tự hay xóa trang khác thì dấu "Cần chụp lại" vẫn nằm đúng trang,
 * và một trang tự hết dấu khi được thay ảnh (trang mới có id mới).
 */
type Snapshot = {
  /** Id các trang theo thứ tự lúc gửi đi phân tích lần gần nhất. */
  submittedIds: string[];
  error: AppError | null;
  /** Id các trang lúc nhận lỗi, để biết người dùng đã sửa gì chưa. */
  idsAtError: string[];
};

let snapshot: Snapshot = { submittedIds: [], error: null, idsAtError: [] };
const listeners = new Set<() => void>();

function update(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
}

useAppStore.subscribe((state, prev) => {
  if (state.analysisStatus === 'running' && prev.analysisStatus !== 'running') {
    update({ submittedIds: state.pages.map((p) => p.id), error: null, idsAtError: [] });
  } else if (state.analysisStatus === 'error' && state.analysisError !== prev.analysisError) {
    update({ error: state.analysisError, idsAtError: state.pages.map((p) => p.id) });
  } else if (state.analysisStatus === 'done' && prev.analysisStatus !== 'done') {
    update({ error: null, idsAtError: [] });
  } else if (state.pages.length === 0 && prev.pages.length > 0 && snapshot.error) {
    update({ error: null, idsAtError: [] });
  }
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;

/** Trạng thái đang nhớ. Chỉ dùng cho test. */
export const getAnalysisMemory = getSnapshot;

/** Trang cần chụp lại và thông báo lỗi để hiện ở màn chụp. */
export function useAnalysisFeedback(): CaptureFeedback {
  const { error, submittedIds, idsAtError } = useSyncExternalStore(subscribe, getSnapshot);
  const pages = useAppStore((s) => s.pages);
  return captureFeedback(
    error,
    submittedIds,
    idsAtError,
    pages.map((p) => p.id),
  );
}
