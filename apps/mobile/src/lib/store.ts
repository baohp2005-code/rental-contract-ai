/**
 * Trạng thái của app. Mọi màn hình đọc/ghi qua đây.
 *
 * Quyền riêng tư: chỉ lưu bền xuống máy việc người dùng đã đồng ý điều khoản.
 * Danh sách trang và kết quả phân tích chỉ nằm trong bộ nhớ, tắt app là mất.
 * Riêng file ảnh (camera, ảnh đã chuẩn hóa) nằm trong thư mục cache của app
 * cho tới khi hệ điều hành dọn; app chưa tự xóa các file này.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MAX_PAGES,
  type Addressing,
  type AnalyzeResponse,
  type Flag,
  type KeptFlag,
  type MessageResponse,
  type OcrLine,
  type Severity,
  type Tone,
} from '@rental/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  ApiRequestError,
  api,
  errorMessage,
  type AnalysisStep,
  type ApiErrorCode,
  type CapturedPage,
} from './api';
import { loadSamplePages } from './api/mock';

/** Quyết định của sinh viên với một cảnh báo. */
export type Decision = 'pending' | 'kept' | 'dropped';

export type RequestStatus = 'idle' | 'running' | 'done' | 'error';

export type AppError = { code: ApiErrorCode; message: string; pages?: number[] };

type State = {
  consentAccepted: boolean;
  /** false cho tới khi đọc xong consentAccepted từ máy. */
  hydrated: boolean;

  pages: CapturedPage[];

  analysisStatus: RequestStatus;
  analysisStep: AnalysisStep | null;
  analysisError: AppError | null;
  analysis: AnalyzeResponse | null;

  decisions: Record<string, Decision>;
  /** Câu hỏi gửi chủ nhà mà sinh viên đã sửa, theo id cảnh báo. */
  editedQuestions: Record<string, string>;

  addressing: Addressing;
  tone: Tone;
  messageStatus: RequestStatus;
  messageError: AppError | null;
  message: MessageResponse | null;
};

type Actions = {
  acceptConsent: () => void;

  /** Trả về false nếu đã đủ MAX_PAGES trang. */
  addPage: (page: CapturedPage) => boolean;
  removePage: (id: string) => void;
  movePage: (id: string, direction: -1 | 1) => void;
  replacePage: (id: string, page: CapturedPage) => void;
  loadSample: () => Promise<void>;

  /** Gửi các trang đi phân tích. Không ném lỗi: xem analysisStatus / analysisError. */
  startAnalysis: () => Promise<void>;
  cancelAnalysis: () => void;

  setDecision: (flagId: string, decision: Decision) => void;
  setEditedQuestion: (flagId: string, question: string) => void;

  setAddressing: (addressing: Addressing) => void;
  setTone: (tone: Tone) => void;
  /** Soạn tin nhắn từ các cảnh báo đã giữ. Không ném lỗi: xem messageStatus. */
  composeMessage: () => Promise<void>;

  /** Xóa hợp đồng hiện tại để bắt đầu lại. Giữ consent. */
  reset: () => void;
};

const sessionDefaults = {
  pages: [] as CapturedPage[],
  analysisStatus: 'idle' as RequestStatus,
  analysisStep: null as AnalysisStep | null,
  analysisError: null as AppError | null,
  analysis: null as AnalyzeResponse | null,
  decisions: {} as Record<string, Decision>,
  editedQuestions: {} as Record<string, string>,
  addressing: 'em-anhchi' as Addressing,
  tone: 'gentle' as Tone,
  messageStatus: 'idle' as RequestStatus,
  messageError: null as AppError | null,
  message: null as MessageResponse | null,
};

function toAppError(error: unknown): AppError {
  if (error instanceof ApiRequestError) {
    return { code: error.code, message: errorMessage[error.code], pages: error.pages };
  }
  return { code: 'internal', message: errorMessage.internal };
}

let analysisAbort: AbortController | null = null;

/**
 * Tăng mỗi khi tin nhắn hiện tại không còn đúng (đổi xưng hô, giọng, lựa chọn...).
 * Kết quả của một lần soạn cũ về sau sẽ bị bỏ qua thay vì đè lên bản mới.
 */
let messageSeq = 0;
const invalidateMessage = () => {
  messageSeq += 1;
  return { message: null, messageStatus: 'idle' as RequestStatus, messageError: null };
};

export const useAppStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      consentAccepted: false,
      hydrated: false,
      ...sessionDefaults,

      acceptConsent: () => set({ consentAccepted: true }),

      addPage: (page) => {
        if (get().pages.length >= MAX_PAGES) return false;
        set((s) => ({ pages: [...s.pages, page] }));
        return true;
      },
      removePage: (id) => set((s) => ({ pages: s.pages.filter((p) => p.id !== id) })),
      movePage: (id, direction) =>
        set((s) => {
          const from = s.pages.findIndex((p) => p.id === id);
          const to = from + direction;
          if (from < 0 || to < 0 || to >= s.pages.length) return s;
          const pages = [...s.pages];
          [pages[from], pages[to]] = [pages[to], pages[from]];
          return { pages };
        }),
      replacePage: (id, page) =>
        set((s) => ({ pages: s.pages.map((p) => (p.id === id ? page : p)) })),
      loadSample: async () => {
        set({ pages: await loadSamplePages() });
      },

      startAnalysis: async () => {
        const { pages } = get();
        if (pages.length === 0 || get().analysisStatus === 'running') return;

        analysisAbort?.abort();
        const controller = new AbortController();
        analysisAbort = controller;
        set({
          analysisStatus: 'running',
          analysisStep: 'upload',
          analysisError: null,
          analysis: null,
          decisions: {},
          editedQuestions: {},
          messageStatus: 'idle',
          messageError: null,
          message: null,
        });

        try {
          const result = await api.analyze(pages, {
            signal: controller.signal,
            onStep: (step) => set({ analysisStep: step }),
          });
          if (controller.signal.aborted) return;
          set({
            analysisStatus: 'done',
            analysisStep: null,
            analysis: result.analysis,
            pages: result.pagesOverride ?? pages,
            decisions: Object.fromEntries(
              result.analysis.flags.map((f) => [f.id, 'pending' as Decision]),
            ),
          });
        } catch (error) {
          if (controller.signal.aborted) return;
          set({ analysisStatus: 'error', analysisStep: null, analysisError: toAppError(error) });
        }
      },
      cancelAnalysis: () => {
        analysisAbort?.abort();
        analysisAbort = null;
        // Giữ lại lỗi (nếu có) để màn chụp biết trang nào cần chụp lại.
        set((s) => ({
          analysisStatus: 'idle',
          analysisStep: null,
          analysisError: s.analysisStatus === 'error' ? s.analysisError : null,
        }));
      },

      setDecision: (flagId, decision) =>
        set((s) => ({
          decisions: { ...s.decisions, [flagId]: decision },
          // Danh sách giữ đã đổi nên tin nhắn cũ không còn đúng.
          ...invalidateMessage(),
        })),
      setEditedQuestion: (flagId, question) =>
        set((s) => ({
          editedQuestions: { ...s.editedQuestions, [flagId]: question },
          ...invalidateMessage(),
        })),

      setAddressing: (addressing) => set({ addressing, ...invalidateMessage() }),
      setTone: (tone) => set({ tone, ...invalidateMessage() }),

      composeMessage: async () => {
        const state = get();
        const flags = selectKeptFlags(state);
        if (!state.analysis || flags.length === 0 || state.messageStatus === 'running') return;
        const seq = ++messageSeq;
        set({ messageStatus: 'running', messageError: null });
        try {
          const message = await api.composeMessage({
            contract_id: state.analysis.contract_id,
            flags,
            addressing: state.addressing,
            tone: state.tone,
          });
          if (seq !== messageSeq) return;
          set({ messageStatus: 'done', message });
        } catch (error) {
          if (seq !== messageSeq) return;
          set({ messageStatus: 'error', messageError: toAppError(error) });
        }
      },

      reset: () => {
        analysisAbort?.abort();
        analysisAbort = null;
        messageSeq += 1;
        set({ ...sessionDefaults });
      },
    }),
    {
      name: 'soi-hop-dong',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ consentAccepted: state.consentAccepted }),
      onRehydrateStorage: () => () => {
        useAppStore.setState({ hydrated: true });
      },
    },
  ),
);

// ---------- Selector (hàm thuần, dùng được cả trong test) ----------

type Snapshot = Pick<State, 'analysis' | 'decisions' | 'editedQuestions'>;

const severityRank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Cảnh báo xếp theo mức độ, nghiêm trọng nhất trước. */
export function selectSortedFlags(state: Pick<State, 'analysis'>): Flag[] {
  const flags = state.analysis?.flags ?? [];
  return [...flags].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

export function selectFlag(state: Pick<State, 'analysis'>, id: string): Flag | undefined {
  return state.analysis?.flags.find((f) => f.id === id);
}

/** Các dòng OCR mà một cảnh báo trích dẫn. Rỗng với cảnh báo loại "missing". */
export function selectLinesForFlag(state: Pick<State, 'analysis'>, flag: Flag): OcrLine[] {
  const lines = state.analysis?.lines ?? [];
  return lines.filter((line) => flag.line_ids.includes(line.id));
}

/** Câu hỏi gửi chủ nhà: bản sinh viên đã sửa nếu có, không thì bản gốc. */
export function selectQuestion(state: Pick<State, 'editedQuestions'>, flag: Flag): string {
  const edited = state.editedQuestions[flag.id]?.trim();
  return edited ? edited : flag.question_for_landlord;
}

/** Cảnh báo sinh viên đã giữ, ở dạng gửi cho POST /message. */
export function selectKeptFlags(state: Snapshot): KeptFlag[] {
  return selectSortedFlags(state)
    .filter((f) => state.decisions[f.id] === 'kept')
    .map((f) => ({
      id: f.id,
      rule_id: f.rule_id,
      title: f.title,
      quote: f.quote,
      question_for_landlord: selectQuestion(state, f),
      suggested_clause: f.suggested_clause,
    }));
}

export type ReviewProgress = {
  total: number;
  kept: number;
  dropped: number;
  pending: number;
  bySeverity: Record<Severity, number>;
};

export function selectReviewProgress(state: Pick<State, 'analysis' | 'decisions'>): ReviewProgress {
  const flags = state.analysis?.flags ?? [];
  const progress: ReviewProgress = {
    total: flags.length,
    kept: 0,
    dropped: 0,
    pending: 0,
    bySeverity: { high: 0, medium: 0, low: 0 },
  };
  for (const flag of flags) {
    progress.bySeverity[flag.severity] += 1;
    const decision = state.decisions[flag.id] ?? 'pending';
    progress[decision] += 1;
  }
  return progress;
}

/** Cảnh báo chưa duyệt kế tiếp sau `afterId` (theo thứ tự hiển thị), nếu có. */
export function selectNextPendingFlag(
  state: Pick<State, 'analysis' | 'decisions'>,
  afterId?: string,
): Flag | undefined {
  const sorted = selectSortedFlags(state);
  const start = afterId ? sorted.findIndex((f) => f.id === afterId) + 1 : 0;
  const isPending = (f: Flag) => (state.decisions[f.id] ?? 'pending') === 'pending';
  return (
    sorted.slice(start).find(isPending) ??
    sorted.slice(0, Math.max(start - 1, 0)).find(isPending)
  );
}
