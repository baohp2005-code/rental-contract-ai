/**
 * Giới hạn số lượt gọi mỗi giờ cho từng địa chỉ IP.
 *
 * Khi backend lên mạng công khai (Render), ai biết địa chỉ cũng gọi được và
 * tốn tiền key OpenAI/Google của nhóm. Đếm trong bộ nhớ: khởi động lại server
 * là đếm lại từ đầu, đủ cho bản demo.
 */
import type { MiddlewareHandler } from 'hono';

import { ApiFailure } from './pipeline/errors';

const WINDOW_MS = 60 * 60 * 1000;

/** Lấy IP người gọi. Render đứng sau proxy nên IP thật nằm ở X-Forwarded-For. */
export function clientIp(forwardedFor: string | undefined, fallback = 'unknown'): string {
  return forwardedFor?.split(',')[0]?.trim() || fallback;
}

/**
 * @param limitPerHour số lượt tối đa mỗi giờ cho một IP; 0 hoặc âm = không giới hạn
 */
export function rateLimit(limitPerHour: number, now: () => number = Date.now): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return async (c, next) => {
    if (limitPerHour <= 0) return next();
    const ip = clientIp(c.req.header('x-forwarded-for'));
    const t = now();
    let entry = hits.get(ip);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + WINDOW_MS };
      hits.set(ip, entry);
    }
    entry.count += 1;
    if (entry.count > limitPerHour) {
      const minutes = Math.ceil((entry.resetAt - t) / 60_000);
      c.header('Retry-After', String(Math.ceil((entry.resetAt - t) / 1000)));
      throw new ApiFailure('internal', `Bạn đã gửi quá nhiều lượt. Thử lại sau khoảng ${minutes} phút.`, 429);
    }
    // Dọn các mục đã hết hạn để bộ nhớ không phình ra.
    if (hits.size > 5000) {
      for (const [key, value] of hits) if (value.resetAt <= t) hits.delete(key);
    }
    return next();
  };
}
