/**
 * Chọn nhà cung cấp LLM theo biến LLM_PROVIDER (claude | openai | none).
 * Không đặt thì tự chọn theo key có sẵn: có ANTHROPIC_API_KEY thì Claude,
 * chỉ có OPENAI_API_KEY thì OpenAI, không có key nào thì "none" (chế độ không AI).
 */
import { createClaudeLlm } from './claude';
import { createOpenAiLlm } from './openai';
import type { Llm } from './types';

export type LlmProvider = 'claude' | 'openai' | 'none';

export function pickProvider(env: NodeJS.ProcessEnv): LlmProvider {
  const raw = env.LLM_PROVIDER?.trim().toLowerCase();
  if (raw === 'claude' || raw === 'openai' || raw === 'none') return raw;
  if (raw) throw new Error(`LLM_PROVIDER phải là "claude", "openai" hoặc "none", đang là "${raw}"`);
  if (env.ANTHROPIC_API_KEY?.trim()) return 'claude';
  if (env.OPENAI_API_KEY?.trim()) return 'openai';
  return 'none';
}

/** Trả null ở chế độ "none": pipeline dùng quy tắc thay cho LLM. */
export function createLlm(env: NodeJS.ProcessEnv = process.env): Llm | null {
  const provider = pickProvider(env);
  if (provider === 'none') return null;
  return provider === 'openai'
    ? createOpenAiLlm({ apiKey: env.OPENAI_API_KEY?.trim(), model: env.OPENAI_MODEL?.trim() })
    : createClaudeLlm({
        apiKey: env.ANTHROPIC_API_KEY?.trim(),
        model: env.CLAUDE_MODEL?.trim() || 'claude-opus-5-5',
      });
}

export type { Llm } from './types';
