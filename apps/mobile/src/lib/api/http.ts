import {
  AnalyzeResponseSchema,
  ApiErrorSchema,
  MessageResponseSchema,
  type MessageRequest,
} from '@rental/shared';

import {
  ApiRequestError,
  type AnalysisStep,
  type AnalyzeOptions,
  type ApiClient,
  type CapturedPage,
} from './types';

const ANALYZE_TIMEOUT_MS = 120_000;
const MESSAGE_TIMEOUT_MS = 60_000;

/**
 * Backend trả kết quả một lần, không báo tiến độ. Các bước hiển thị vì vậy
 * chạy theo đồng hồ ước lượng, và dừng ở bước cuối cho tới khi có kết quả.
 */
const STEP_AT_MS: [AnalysisStep, number][] = [
  ['ocr', 1_500],
  ['extract', 5_000],
  ['risk', 12_000],
];

async function request(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  outer?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (outer?.aborted) controller.abort();
  outer?.addEventListener('abort', onOuterAbort);

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch {
    if (timedOut) throw new ApiRequestError('timeout', 'Request timed out');
    if (outer?.aborted) throw new ApiRequestError('aborted', 'Request aborted');
    throw new ApiRequestError('network', 'Network request failed');
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuterAbort);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Thân phản hồi không phải JSON: xử lý ở dưới theo mã trạng thái.
  }

  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    if (parsed.success) {
      const { code, message, pages } = parsed.data.error;
      throw new ApiRequestError(code, message, pages);
    }
    throw new ApiRequestError('internal', `HTTP ${response.status}`);
  }
  return body;
}

export function createHttpClient(baseUrl: string): ApiClient {
  const base = baseUrl.replace(/\/+$/, '');

  return {
    isMock: false,

    async analyze(pages: CapturedPage[], options: AnalyzeOptions = {}) {
      const form = new FormData();
      pages.forEach((page, index) => {
        // React Native nhận file trong FormData dưới dạng { uri, name, type }.
        form.append('pages', {
          uri: page.uri,
          name: `page-${index + 1}.jpg`,
          type: 'image/jpeg',
        } as unknown as Blob);
      });

      options.onStep?.('upload');
      const timers = STEP_AT_MS.map(([step, at]) => setTimeout(() => options.onStep?.(step), at));
      try {
        const body = await request(
          `${base}/analyze`,
          { method: 'POST', body: form },
          ANALYZE_TIMEOUT_MS,
          options.signal,
        );
        const parsed = AnalyzeResponseSchema.safeParse(body);
        if (!parsed.success) {
          throw new ApiRequestError('internal', 'Phản hồi /analyze không đúng schema');
        }
        return { analysis: parsed.data };
      } finally {
        timers.forEach(clearTimeout);
      }
    },

    async composeMessage(payload: MessageRequest, signal?: AbortSignal) {
      const body = await request(
        `${base}/message`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        MESSAGE_TIMEOUT_MS,
        signal,
      );
      const parsed = MessageResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new ApiRequestError('internal', 'Phản hồi /message không đúng schema');
      }
      return parsed.data;
    },
  };
}
