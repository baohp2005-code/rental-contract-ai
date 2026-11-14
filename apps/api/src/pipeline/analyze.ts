/**
 * Luồng POST /analyze: B1 OCR → B2 LLM đọc → B3 quy tắc → B4 LLM rủi ro.
 */
import { randomUUID } from 'node:crypto';

import { AnalyzeResponseSchema, MAX_PAGES, type AnalyzeResponse } from '@rental/shared';
import { runRuleChecks } from '@rental/shared/src/rules';

import type { Knowledge, Prompts } from '../knowledge';
import type { Llm } from '../llm/types';
import type { OcrProvider } from '../ocr/vision';
import { ApiFailure } from './errors';
import { extract, type PageImage } from './extract';
import { extractOffline, keywordFlags } from './offline';
import { analyzeRisk, finalizeFlags } from './risk';

export type Pipeline = {
  ocr: OcrProvider;
  /** null = chế độ không AI (LLM_PROVIDER=none). */
  llm: Llm | null;
  knowledge: Knowledge;
  prompts: Prompts;
};

/** Dưới số ký tự này thì coi như trang không đọc được, khỏi tốn tiền gọi LLM. */
const MIN_CHARS_PER_PAGE = 20;

export async function analyzeContract(p: Pipeline, images: PageImage[]): Promise<AnalyzeResponse> {
  if (images.length === 0) {
    throw new ApiFailure('internal', 'Chưa có ảnh trang nào trong trường "pages".', 400);
  }
  if (images.length > MAX_PAGES) {
    throw new ApiFailure('too_many_pages', `Tối đa ${MAX_PAGES} trang.`, 400);
  }

  const t0 = Date.now();

  // B1 · OCR
  const pages = await p.ocr.readPages(images.map((i) => i.data));
  const unreadable = pages
    .filter((pg) => pg.lines.reduce((n, l) => n + l.text.length, 0) < MIN_CHARS_PER_PAGE)
    .map((pg) => pg.info.page);
  if (unreadable.length > 0) {
    throw new ApiFailure('image_unreadable', 'Không đọc được chữ trên ảnh.', 422, unreadable);
  }
  const ocrLines = pages.flatMap((pg) => pg.lines);
  console.log(`[B1] ${Date.now() - t0}ms · ${pages.length} trang · ${ocrLines.length} dòng`);

  // B2 · LLM đọc & trích xuất
  const extracted = p.llm
    ? await extract(p.llm, p.prompts.extract, images, ocrLines)
    : extractOffline(ocrLines);
  if (!extracted.isRentalContract) {
    throw new ApiFailure('not_a_contract', 'Ảnh có vẻ không phải hợp đồng thuê trọ.', 422);
  }
  if (extracted.unreadablePages.length > 0) {
    throw new ApiFailure(
      'image_unreadable',
      'Một số trang khó đọc (ảnh mờ hoặc chữ viết tay), kết quả có thể sai nên cần chụp lại.',
      422,
      extracted.unreadablePages,
    );
  }

  // B3 · Quy tắc (code thuần)
  const ruleResults = runRuleChecks(extracted.keyTerms, p.knowledge.checklist, p.knowledge.norms);
  const triggered = ruleResults.filter((r) => r.triggered).map((r) => r.rule_id);
  console.log(`[B3] bắt được: ${triggered.join(', ') || '(không)'}`);

  // B4 · LLM rủi ro + kiểm tra mã dòng, câu trích
  const risk = p.llm
    ? await analyzeRisk(p.llm, p.prompts.risk, p.knowledge, extracted.lines, extracted.keyTerms, ruleResults)
    : finalizeFlags(
        { flags: keywordFlags(extracted.lines, p.knowledge) },
        p.knowledge,
        extracted.lines,
        ruleResults,
      );
  console.log(
    `[xong] ${Date.now() - t0}ms · ${risk.flags.length} cảnh báo · bỏ ${risk.dropped.length} cảnh báo không khớp`,
  );

  return AnalyzeResponseSchema.parse({
    contract_id: randomUUID(),
    pages: pages.map((pg) => pg.info),
    lines: extracted.lines,
    key_terms: extracted.keyTerms,
    flags: risk.flags,
  });
}
