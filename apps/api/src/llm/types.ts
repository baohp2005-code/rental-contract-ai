/**
 * Lớp LLM dùng chung cho mọi nhà cung cấp (Claude, OpenAI).
 * Pipeline chỉ biết interface này nên đổi nhà cung cấp không phải sửa B2/B4/B5.
 */
import type { z } from 'zod';

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

/** Nội dung gửi kèm, trung lập với nhà cung cấp. */
export type UserBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: ImageMediaType; base64: string };

export type UserContent = UserBlock[];

export type StructuredRequest<T> = {
  /** Tên bước để ghi log, ví dụ "B2". */
  step: string;
  system: string;
  content: UserContent;
  schema: z.ZodType<T>;
  maxTokens: number;
};

export interface Llm {
  /** Tên hiển thị trong log, ví dụ "claude:claude-opus-5-5". */
  readonly label: string;
  structured<T>(request: StructuredRequest<T>): Promise<T>;
}

export class LlmError extends Error {
  constructor(step: string, message: string) {
    super(`${step}: ${message}`);
    this.name = 'LlmError';
  }
}
