import type {
  AnalyzeResponse,
  ApiError,
  MessageRequest,
  MessageResponse,
} from '@rental/shared';

/** Một trang hợp đồng người dùng đã chụp hoặc chọn. */
export type CapturedPage = {
  id: string;
  /** Đường dẫn ảnh trên máy (file://...) hoặc http khi là ảnh mẫu lúc dev. */
  uri: string;
  width: number;
  height: number;
  origin: 'camera' | 'library' | 'sample';
};

/** Các bước hiển thị ở màn "Đang phân tích". */
export type AnalysisStep = 'upload' | 'ocr' | 'extract' | 'risk';
export const ANALYSIS_STEPS: AnalysisStep[] = ['upload', 'ocr', 'extract', 'risk'];

export type AnalyzeOptions = {
  onStep?: (step: AnalysisStep) => void;
  signal?: AbortSignal;
};

export type AnalyzeResult = {
  analysis: AnalyzeResponse;
  /** Chỉ có ở chế độ dữ liệu mẫu: thay ảnh người dùng bằng ảnh hợp đồng mẫu. */
  pagesOverride?: CapturedPage[];
};

export interface ApiClient {
  /** true = đang dùng dữ liệu mẫu, chưa nối backend. */
  readonly isMock: boolean;
  analyze(pages: CapturedPage[], options?: AnalyzeOptions): Promise<AnalyzeResult>;
  composeMessage(request: MessageRequest, signal?: AbortSignal): Promise<MessageResponse>;
}

export type ApiErrorCode = ApiError['error']['code'] | 'network' | 'timeout' | 'aborted';

/** Mọi lỗi từ lớp API đều được chuyển về kiểu này. */
export class ApiRequestError extends Error {
  readonly code: ApiErrorCode;
  /** Trang cần chụp lại (bắt đầu từ 1), nếu backend chỉ ra. */
  readonly pages?: number[];

  constructor(code: ApiErrorCode, message: string, pages?: number[]) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.pages = pages;
  }
}

/** Thông báo tiếng Việt cho người dùng, theo mã lỗi. */
export const errorMessage: Record<ApiErrorCode, string> = {
  image_unreadable:
    'App chưa đọc chắc được chữ (ảnh mờ, thiếu sáng hoặc chữ viết tay khó đọc). Bạn chụp lại gần hơn, đủ sáng nhé. Nếu vẫn lỗi, đừng coi hợp đồng là không có vấn đề: hãy tự đọc kỹ hoặc nhờ người khác xem.',
  not_a_contract: 'Ảnh này có vẻ không phải hợp đồng thuê trọ. Bạn kiểm tra lại ảnh nhé.',
  too_many_pages: 'Hợp đồng có quá nhiều trang. Hãy bỏ bớt trang không cần thiết.',
  internal: 'Máy chủ đang gặp sự cố. Bạn thử lại sau ít phút.',
  network: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
  timeout: 'Phân tích mất quá nhiều thời gian. Bạn thử lại nhé.',
  aborted: 'Đã hủy.',
};
