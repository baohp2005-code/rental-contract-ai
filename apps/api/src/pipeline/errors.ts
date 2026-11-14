import type { ApiError } from '@rental/shared';

export type ApiErrorCode = ApiError['error']['code'];

/** Lỗi trả về app theo đúng ApiErrorSchema. */
export class ApiFailure extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: 400 | 413 | 422 | 429 | 500 | 502 = 422,
    readonly pages?: number[],
  ) {
    super(message);
    this.name = 'ApiFailure';
  }

  toBody(): ApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.pages && this.pages.length > 0 ? { pages: this.pages } : {}),
      },
    };
  }
}
