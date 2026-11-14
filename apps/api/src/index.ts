/**
 * Khởi động server: `npm run dev -w @rental/api` (tự chạy lại khi sửa code).
 */
import { networkInterfaces } from 'node:os';

import { serve } from '@hono/node-server';

import { createApp } from './app';
import { API_ROOT, loadEnvFile, readConfig } from './config';
import { loadKnowledge, loadPrompts } from './knowledge';
import { createLlm } from './llm';
import { checkVisionCredentials, createVisionOcr } from './ocr/vision';

// Thư viện Google đôi khi để lọt một promise bị từ chối (vd sai credentials).
// Ghi log thay vì để cả server sập giữa buổi demo.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.message : reason);
});

loadEnvFile();
const config = readConfig();
const visionWarning = checkVisionCredentials(process.env, API_ROOT);
if (visionWarning) console.warn(`⚠️  ${visionWarning}`);
const knowledge = loadKnowledge(config.dataDir);

const llm = createLlm();
const app = createApp({
  ocr: createVisionOcr(),
  llm,
  knowledge,
  prompts: loadPrompts(config.promptsDir, knowledge),
});

// 0.0.0.0 để điện thoại cùng Wi-Fi gọi được vào máy tính.
serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`API chạy · LLM ${llm?.label ?? 'none (chế độ không AI: quy tắc + từ khóa)'}`);
  console.log(`  Trên máy này:  http://localhost:${info.port}/health`);
  // IP trong mạng nội bộ: điền vào EXPO_PUBLIC_API_URL để điện thoại cùng Wi-Fi gọi được.
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n!.address);
  for (const ip of lan) console.log(`  Cho điện thoại: http://${ip}:${info.port}`);
  console.log(`Checklist: ${knowledge.checklist.rules.length} quy tắc · dữ liệu: ${config.dataDir}`);
});
