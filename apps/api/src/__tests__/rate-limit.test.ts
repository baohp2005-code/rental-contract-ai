import path from 'node:path';

import { ApiErrorSchema } from '@rental/shared';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../app';
import { REPO_ROOT, readConfig } from '../config';
import { loadKnowledge, loadPrompts } from '../knowledge';
import { clientIp } from '../rate-limit';

const knowledge = loadKnowledge(path.join(REPO_ROOT, 'data'));
const prompts = loadPrompts(path.join(REPO_ROOT, 'prompts'), knowledge);
const ocr = { readPages: async () => [] };

function post(app: ReturnType<typeof createApp>, ip: string) {
  return app.request('/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `${ip}, 10.0.0.1` },
    body: '{}',
  });
}

describe('giới hạn số lượt theo IP', () => {
  it('quá giới hạn thì trả 429 đúng khuôn lỗi; IP khác không bị ảnh hưởng', async () => {
    const app = createApp({ ocr, llm: null, knowledge, prompts }, { messagePerHour: 2 });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect((await post(app, '1.1.1.1')).status).toBe(400);
    expect((await post(app, '1.1.1.1')).status).toBe(400);
    const blocked = await post(app, '1.1.1.1');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect(ApiErrorSchema.parse(await blocked.json()).error.message).toContain('quá nhiều lượt');
    expect((await post(app, '2.2.2.2')).status).toBe(400);
    // /health không bị giới hạn
    expect((await app.request('/health')).status).toBe(200);
    log.mockRestore();
  });

  it('mặc định không giới hạn khi chạy trên máy', async () => {
    const app = createApp({ ocr, llm: null, knowledge, prompts });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    for (let i = 0; i < 5; i++) expect((await post(app, '1.1.1.1')).status).toBe(400);
    log.mockRestore();
  });

  it('đọc IP đầu tiên trong X-Forwarded-For và cấu hình từ biến môi trường', () => {
    expect(clientIp('203.0.113.5, 10.0.0.1')).toBe('203.0.113.5');
    expect(clientIp(undefined)).toBe('unknown');
    const c = readConfig({ RATE_LIMIT_ANALYZE_PER_HOUR: '20', RENDER_EXTERNAL_URL: 'https://x.onrender.com' });
    expect(c.analyzePerHour).toBe(20);
    expect(c.messagePerHour).toBe(0);
    expect(c.publicUrl).toBe('https://x.onrender.com');
  });
});
