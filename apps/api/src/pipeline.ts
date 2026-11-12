import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeResponseSchema, extractionSchema, pageSchema, riskSchema, validateAnalysis } from '@rental/shared';
import { z } from 'zod';
import { ROOT, getConfig } from './config.ts';
import { AppError } from './errors.ts';
import { googleOcr, type ImageInput } from './ocr.ts';
import { runLlm, PROMPT_VERSION, CHECKLIST_VERSION } from './llm.ts';

export const SAMPLE_IDS = ['hd01', 'hd02', 'hd03'] as const;
const replaySchema = z.object({ id:z.string(), title:z.string(), source:z.literal('synthetic'), pages:z.array(pageSchema), extraction:extractionSchema, risk:riskSchema });
export async function loadReplay(id: string) {
  if (!(SAMPLE_IDS as readonly string[]).includes(id)) throw new AppError('SAMPLE_NOT_FOUND', 'Không có hợp đồng mẫu này.', 400);
  try { return replaySchema.parse(JSON.parse(await readFile(path.join(ROOT,'data/samples/generated',`${id}.replay.json`),'utf8'))); }
  catch { throw new AppError('SAMPLE_NOT_GENERATED', 'Chạy npm run samples:generate trước khi dùng bộ mẫu.', 503); }
}
export async function analyzeReplay(id: string, allPagesConfirmed: boolean) {
  const started = performance.now();
  const sample = await loadReplay(id);
  const checked = validateAnalysis(sample.pages, sample.extraction, sample.risk.flags, allPagesConfirmed);
  return analyzeResponseSchema.parse({
    analysis_id:randomUUID(), mode:'replay', sample_id:id, pages:sample.pages, ...checked,
    warnings:['DỮ LIỆU MÔ PHỎNG: OCR và kết quả AI được soạn sẵn để kiểm tra luồng; chưa chứng minh chất lượng AI thật.', ...checked.warnings],
    metadata:{model:'authored-replay',prompt_version:PROMPT_VERSION,checklist_version:CHECKLIST_VERSION,elapsed_ms:Math.round(performance.now()-started),input_tokens:0,output_tokens:0},
  });
}
export async function analyzeLive(images: ImageInput[], allPagesConfirmed: boolean) {
  const config = getConfig(), started = performance.now();
  if (!config.openaiKey || !config.model) throw new AppError('LLM_NOT_CONFIGURED', 'Cần cấu hình OPENAI_API_KEY và OPENAI_MODEL.', 503);
  const pages = await googleOcr(images, config.googleKey);
  const llm = await runLlm(pages, images, config.openaiKey, config.model);
  const extracted = validateAnalysis(pages, llm.extraction, [], allPagesConfirmed);
  const risk = await llm.analyzeRisk(extracted.extraction, allPagesConfirmed);
  const checked = validateAnalysis(pages, llm.extraction, risk.flags, allPagesConfirmed);
  return analyzeResponseSchema.parse({
    analysis_id:randomUUID(),mode:'live',sample_id:null,pages,...checked,
    metadata:{model:config.model,prompt_version:PROMPT_VERSION,checklist_version:CHECKLIST_VERSION,elapsed_ms:Math.round(performance.now()-started),input_tokens:risk.inputTokens,output_tokens:risk.outputTokens},
  });
}
