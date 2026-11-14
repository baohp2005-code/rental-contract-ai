/**
 * Chạy cả luồng phân tích trên ảnh trong máy, không cần app. Dùng cho vai
 * Prompt khi sửa prompt và chạy eval.
 *
 *   npm run analyze -w @rental/api -- ../../data/samples/hd01-p1.jpg ../../data/samples/hd01-p2.jpg
 *
 * In JSON kết quả ra màn hình; thêm `> out.json` để lưu.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { sniffImageType } from '../src/app';
import { API_ROOT, loadEnvFile, readConfig } from '../src/config';
import { loadKnowledge, loadPrompts } from '../src/knowledge';
import { createLlm } from '../src/llm';
import { checkVisionCredentials, createVisionOcr } from '../src/ocr/vision';
import { analyzeContract } from '../src/pipeline/analyze';
import { ApiFailure } from '../src/pipeline/errors';
import type { PageImage } from '../src/pipeline/extract';

// Log từng bước ra stderr để `> out.json` chỉ chứa JSON kết quả.
console.log = (...args: unknown[]) => console.error(...args);

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Cách dùng: npm run analyze -w @rental/api -- <ảnh trang 1> [ảnh trang 2] ...');
  process.exit(1);
}

loadEnvFile();
const config = readConfig();
const visionWarning = checkVisionCredentials(process.env, API_ROOT);
if (visionWarning) console.error(`⚠️  ${visionWarning}`);
const knowledge = loadKnowledge(config.dataDir);

const images: PageImage[] = files.map((f) => {
  const data = readFileSync(path.resolve(process.env.INIT_CWD ?? process.cwd(), f));
  const mediaType = sniffImageType(data);
  if (!mediaType) throw new Error(`${f}: không phải ảnh JPEG/PNG/WebP`);
  return { data, mediaType };
});

try {
  const result = await analyzeContract(
    {
      ocr: createVisionOcr(),
      llm: createLlm(),
      knowledge,
      prompts: loadPrompts(config.promptsDir, knowledge),
    },
    images,
  );
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (err) {
  if (err instanceof ApiFailure) {
    console.error(JSON.stringify(err.toBody(), null, 2));
    process.exit(2);
  }
  throw err;
}
