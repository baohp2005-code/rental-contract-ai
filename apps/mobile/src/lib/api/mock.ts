import type { Addressing, MessageRequest, MessageResponse } from '@rental/shared';
import { Asset } from 'expo-asset';

import { sampleAnalysis, samplePageModules } from '@/mocks/sample-analysis';

import {
  ANALYSIS_STEPS,
  ApiRequestError,
  type AnalyzeOptions,
  type ApiClient,
  type CapturedPage,
} from './types';

const STEP_DELAY_MS = 900;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ApiRequestError('aborted', 'Request aborted'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new ApiRequestError('aborted', 'Request aborted'));
    });
  });
}

/** Tải ảnh hợp đồng mẫu đi kèm app và trả về dạng CapturedPage. */
export async function loadSamplePages(): Promise<CapturedPage[]> {
  const assets = await Asset.loadAsync(samplePageModules);
  return assets.map((asset, index) => ({
    id: `sample-${index + 1}`,
    uri: asset.localUri ?? asset.uri,
    width: asset.width ?? sampleAnalysis.pages[index].width,
    height: asset.height ?? sampleAnalysis.pages[index].height,
    origin: 'sample' as const,
  }));
}

const pronouns: Record<Addressing, { self: string; other: string }> = {
  'em-anhchi': { self: 'em', other: 'anh/chị' },
  'chau-cochu': { self: 'cháu', other: 'cô/chú' },
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Các câu hỏi mẫu viết theo "em – anh/chị"; đổi sang cách xưng hô được chọn. */
export function applyAddressing(text: string, addressing: Addressing): string {
  if (addressing === 'em-anhchi') return text;
  const { self, other } = pronouns[addressing];
  return text
    .split(/(\s+)/)
    .map((token) => {
      const core = token.replace(/[.,?!:;"()]+$/, '');
      const tail = token.slice(core.length);
      if (core === 'em') return self + tail;
      if (core === 'Em') return capitalize(self) + tail;
      if (core === 'anh/chị') return other + tail;
      if (core === 'Anh/chị') return capitalize(other) + tail;
      return token;
    })
    .join('');
}

export function buildMockMessage(request: MessageRequest): MessageResponse {
  const { self, other } = pronouns[request.addressing];
  const Self = capitalize(self);
  const questions = request.flags.map((f) =>
    applyAddressing(f.question_for_landlord, request.addressing),
  );
  const numbered = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
  const n = questions.length;

  const message =
    request.tone === 'gentle'
      ? `${Self} chào ${other} ạ. ${Self} đã đọc hợp đồng thuê phòng và rất muốn thuê ạ. Trước khi ký, ${self} xin phép hỏi lại ${n} điểm để hai bên cùng rõ ạ:\n\n${numbered}\n\n${Self} cảm ơn ${other} nhiều ạ.`
      : `${Self} chào ${other}. ${Self} đã đọc kỹ hợp đồng và còn ${n} điểm cần làm rõ trước khi ký:\n\n${numbered}\n\nMong ${other} phản hồi giúp ${self} để mình chốt hợp đồng sớm ạ.`;

  return {
    message,
    questions,
    suggested_clauses: request.flags.map((f) => f.suggested_clause).filter(Boolean),
  };
}

export function createMockClient(): ApiClient {
  return {
    isMock: true,

    async analyze(_pages: CapturedPage[], options: AnalyzeOptions = {}) {
      for (const step of ANALYSIS_STEPS) {
        options.onStep?.(step);
        await wait(STEP_DELAY_MS, options.signal);
      }
      return { analysis: sampleAnalysis, pagesOverride: await loadSamplePages() };
    },

    async composeMessage(request: MessageRequest, signal?: AbortSignal) {
      await wait(STEP_DELAY_MS, signal);
      return buildMockMessage(request);
    },
  };
}
