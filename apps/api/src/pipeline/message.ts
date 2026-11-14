/**
 * B5 · LLM soạn tin nhắn, chỉ từ các cảnh báo sinh viên đã GIỮ.
 */
import {
  MessageResponseSchema,
  type MessageRequest,
  type MessageResponse,
} from '@rental/shared';

import type { Llm } from '../llm/types';
import { MessageOutSchema } from './schemas';

const ADDRESSING_LABEL: Record<MessageRequest['addressing'], string> = {
  'em-anhchi': 'em – anh/chị (sinh viên xưng "em", gọi chủ nhà là "anh/chị")',
  'chau-cochu': 'cháu – cô/chú (sinh viên xưng "cháu", gọi chủ nhà là "cô/chú")',
};

const TONE_LABEL: Record<MessageRequest['tone'], string> = {
  gentle: 'nhẹ nhàng',
  direct: 'thẳng thắn',
};

export async function composeMessage(
  llm: Llm,
  system: string,
  request: MessageRequest,
): Promise<MessageResponse> {
  const text = [
    `<addressing>${ADDRESSING_LABEL[request.addressing]}</addressing>`,
    `<tone>${TONE_LABEL[request.tone]}</tone>`,
    `<kept_flags>${JSON.stringify(request.flags)}</kept_flags>`,
  ].join('\n');

  const out = await llm.structured({
    step: 'B5',
    system,
    content: [{ type: 'text', text }],
    schema: MessageOutSchema,
    maxTokens: 4000,
  });

  const clean = (items: string[]) => items.map((s) => s.trim()).filter(Boolean);
  const questions = clean(out.questions);
  return MessageResponseSchema.parse({
    message: out.message.trim(),
    // Model trả thiếu thì dùng lại câu hỏi sinh viên đã duyệt.
    questions: questions.length > 0 ? questions : clean(request.flags.map((f) => f.question_for_landlord)),
    suggested_clauses: clean(out.suggested_clauses),
  });
}
