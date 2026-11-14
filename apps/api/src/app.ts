/**
 * Các endpoint (Hono). Phụ thuộc (OCR, LLM, kiến thức) được truyền vào để
 * test chạy được mà không gọi Google hay Anthropic thật.
 */
import { MAX_PAGES, MessageRequestSchema } from '@rental/shared';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';

import { analyzeContract, type Pipeline } from './pipeline/analyze';
import { ApiFailure } from './pipeline/errors';
import type { PageImage } from './pipeline/extract';
import { composeMessage } from './pipeline/message';
import { composeMessageOffline } from './pipeline/offline';
import { rateLimit } from './rate-limit';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Nhận dạng ảnh theo vài byte đầu, không tin vào tên file hay content-type. */
export function sniffImageType(data: Buffer): PageImage['mediaType'] | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  return null;
}

export type AppOptions = {
  /** Số lượt /analyze tối đa mỗi giờ cho một IP. 0 = không giới hạn (mặc định khi chạy trên máy). */
  analyzePerHour?: number;
  /** Số lượt /message tối đa mỗi giờ cho một IP. */
  messagePerHour?: number;
};

export function createApp(pipeline: Pipeline, options: AppOptions = {}) {
  const app = new Hono();

  app.use('*', cors());

  // Ghi mọi yêu cầu đến, để biết điện thoại có gọi tới được server hay không.
  app.use('*', async (c, next) => {
    const started = Date.now();
    const size = c.req.header('content-length');
    console.log(`→ ${c.req.method} ${c.req.path}${size ? ` (${Math.round(Number(size) / 1024)} KB)` : ''}`);
    await next();
    console.log(`← ${c.req.method} ${c.req.path} ${c.res.status} · ${Date.now() - started}ms`);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.use('/analyze', rateLimit(options.analyzePerHour ?? 0));
  app.use('/message', rateLimit(options.messagePerHour ?? 0));

  app.post(
    '/analyze',
    bodyLimit({
      maxSize: MAX_PAGES * MAX_IMAGE_BYTES + 1024 * 1024,
      onError: (c) =>
        c.json(new ApiFailure('too_many_pages', 'Ảnh gửi lên quá lớn.', 413).toBody(), 413),
    }),
    async (c) => {
      const body = await c.req.parseBody({ all: true });
      const raw = body['pages'];
      const files = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(
        (f): f is File => typeof f !== 'string',
      );

      const images: PageImage[] = [];
      for (const [i, file] of files.entries()) {
        const data = Buffer.from(await file.arrayBuffer());
        const mediaType = sniffImageType(data);
        if (!mediaType) {
          throw new ApiFailure('image_unreadable', 'File không phải ảnh JPEG/PNG/WebP.', 422, [i + 1]);
        }
        if (data.length > MAX_IMAGE_BYTES) {
          throw new ApiFailure('image_unreadable', 'Ảnh quá lớn (tối đa 8 MB mỗi trang).', 413, [i + 1]);
        }
        images.push({ data, mediaType });
      }

      return c.json(await analyzeContract(pipeline, images));
    },
  );

  app.post('/message', async (c) => {
    const parsed = MessageRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiFailure('internal', 'Dữ liệu gửi lên không đúng khuôn MessageRequest.', 400);
    }
    return c.json(
      pipeline.llm
        ? await composeMessage(pipeline.llm, pipeline.prompts.message, parsed.data)
        : composeMessageOffline(parsed.data),
    );
  });

  app.onError((err, c) => {
    if (err instanceof ApiFailure) {
      return c.json(err.toBody(), err.status);
    }
    console.error(err);
    return c.json(new ApiFailure('internal', 'Máy chủ gặp sự cố khi phân tích.', 500).toBody(), 500);
  });

  return app;
}
