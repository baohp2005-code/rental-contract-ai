/**
 * Gọi Claude với structured outputs: đầu ra bị ép đúng JSON schema (khai báo
 * bằng Zod). Phần system cố định được đánh dấu cache_control để lưu đệm.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import { LlmError, type Llm, type StructuredRequest, type UserContent } from './types';

function toAnthropic(content: UserContent): Anthropic.Messages.ContentBlockParam[] {
  return content.map((b) =>
    b.type === 'text'
      ? { type: 'text', text: b.text }
      : { type: 'image', source: { type: 'base64', media_type: b.mediaType, data: b.base64 } },
  );
}

export function createClaudeLlm(options: { apiKey?: string; model: string }): Llm {
  if (!options.apiKey) {
    throw new Error('LLM_PROVIDER=claude nhưng thiếu ANTHROPIC_API_KEY (điền vào apps/api/.env)');
  }
  const client = new Anthropic({ apiKey: options.apiKey });

  return {
    label: `claude:${options.model}`,
    async structured<T>({ step, system, content, schema, maxTokens }: StructuredRequest<T>) {
      const started = Date.now();
      const message = await client.messages.parse({
        model: options.model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: toAnthropic(content) }],
        output_config: { format: zodOutputFormat(schema) },
      });

      const u = message.usage;
      console.log(
        `[${step}] ${Date.now() - started}ms · in ${u.input_tokens} (cache đọc ${u.cache_read_input_tokens ?? 0}, ghi ${u.cache_creation_input_tokens ?? 0}) · out ${u.output_tokens} · ${message.stop_reason}`,
      );

      if (message.stop_reason === 'max_tokens') {
        throw new LlmError(step, 'Hết max_tokens trước khi trả đủ JSON');
      }
      if (message.stop_reason === 'refusal') {
        throw new LlmError(step, 'Model từ chối trả lời');
      }
      const parsed = message.parsed_output as T | null | undefined;
      if (parsed == null) throw new LlmError(step, 'Không đọc được JSON trả về');
      return parsed;
    },
  };
}
