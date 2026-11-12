export class AppError extends Error {
  constructor(public code: string, public publicMessage: string, public status: 400 | 413 | 422 | 429 | 502 | 503 | 504 = 502) { super(code); }
}
