/**
 * Gọi OpenAI Responses API với Structured Outputs (zodTextFormat), cách làm
 * lấy từ nhánh develop: gửi ảnh dạng data URL, `store: false` để OpenAI không
 * lưu nội dung hợp đồng, không tự thử lại khi lỗi.
 */
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ResponseInputContent } from 'openai/resources/responses/responses';

import { LlmError, type Llm, type StructuredRequest, type UserContent } from './types';

function toOpenAi(content: UserContent): ResponseInputContent[] {
  return content.map((b) =>
    b.type === 'text'
      ? { type: 'input_text', text: b.text }
      : { type: 'input_image', image_url: `data:${b.mediaType};base64,${b.base64}`, detail: 'high' },
  );
}

export function createOpenAiLlm(options: { apiKey?: string; model?: string; fetch?: typeof fetch }): Llm {
  if (!options.apiKey) {
    throw new Error('LLM_PROVIDER=openai nhưng thiếu OPENAI_API_KEY (điền vào apps/api/.env)');
  }
  if (!options.model) {
    throw new Error('LLM_PROVIDER=openai nhưng thiếu OPENAI_MODEL (model có quyền dùng, hỗ trợ ảnh và Structured Outputs)');
  }
  const model = options.model;
  const client = new OpenAI({ apiKey: options.apiKey, timeout: 90_000, maxRetries: 0, fetch: options.fetch });

  return {
    label: `openai:${model}`,
    async structured<T>({ step, system, content, schema, maxTokens }: StructuredRequest<T>) {
      const started = Date.now();
      const response = await client.responses.parse({
        model,
        instructions: system,
        input: [{ role: 'user', content: toOpenAi(content) }],
        text: { format: zodTextFormat(schema, 'result') },
        max_output_tokens: maxTokens,
        store: false,
      });

      const u = response.usage;
      console.log(
        `[${step}] ${Date.now() - started}ms · in ${u?.input_tokens ?? 0} (cache đọc ${u?.input_tokens_details?.cached_tokens ?? 0}) · out ${u?.output_tokens ?? 0} · ${response.status}`,
      );

      if (response.status === 'incomplete') {
        throw new LlmError(step, `Trả lời bị cắt (${response.incomplete_details?.reason ?? 'không rõ'})`);
      }
      const refused = response.output.some(
        (item) => item.type === 'message' && item.content.some((c) => c.type === 'refusal'),
      );
      if (refused) throw new LlmError(step, 'Model từ chối trả lời');
      const parsed = response.output_parsed as T | null;
      if (parsed == null) throw new LlmError(step, 'Không đọc được JSON trả về');
      return parsed;
    },
  };
}
