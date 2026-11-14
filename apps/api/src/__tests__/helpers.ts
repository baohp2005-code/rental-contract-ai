import type { KeyTerm, KeyTerms, OcrLine } from '@rental/shared';

import type { Llm, StructuredRequest } from '../llm/types';

export function line(id: string, text: string): OcrLine {
  const page = Number(id.match(/^p(\d+)/)![1]);
  return { id, page, text, bbox: { x: 0.1, y: 0.1, w: 0.5, h: 0.03 } };
}

export function found(value: number, line_ids: string[] = [], raw_text = String(value)): KeyTerm<number> {
  return { value, raw_text, line_ids, status: 'found' };
}

/** value luôn null nên dùng được cho mọi trường. */
export const notFound = (): KeyTerm<never> => ({ value: null, raw_text: '', line_ids: [], status: 'not_found' });

export function unclear(raw_text: string, line_ids: string[] = []): KeyTerm<never> {
  return { value: null, raw_text, line_ids, status: 'unclear' };
}

export function terms(overrides: Partial<KeyTerms> = {}): KeyTerms {
  return {
    rent_vnd: notFound(),
    deposit_vnd: notFound(),
    electricity_vnd_per_kwh: notFound(),
    water_vnd: notFound(),
    water_unit: notFound(),
    service_fee_vnd: notFound(),
    term_months: notFound(),
    notice_days: notFound(),
    ...overrides,
  } as KeyTerms;
}

/** LLM giả: trả lời theo tên bước, ghi lại các lần gọi. */
export function fakeLlm(answers: Record<string, unknown>) {
  const calls: StructuredRequest<unknown>[] = [];
  const llm: Llm = {
    label: 'fake',
    async structured<T>(req: StructuredRequest<T>): Promise<T> {
      calls.push(req as StructuredRequest<unknown>);
      if (!(req.step in answers)) throw new Error(`fakeLlm: không có câu trả lời cho ${req.step}`);
      // Đi qua schema giống như structured outputs thật.
      return req.schema.parse(answers[req.step]);
    },
  };
  return { llm, calls };
}
