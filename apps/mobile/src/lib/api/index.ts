import { createHttpClient } from './http';
import { createMockClient } from './mock';
import type { ApiClient } from './types';

export * from './types';

/**
 * Đặt EXPO_PUBLIC_API_URL (file apps/mobile/.env) để nối backend thật.
 * Không đặt thì app chạy bằng dữ liệu mẫu.
 */
const baseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const api: ApiClient = baseUrl ? createHttpClient(baseUrl) : createMockClient();

console.log(baseUrl ? `[api] backend thật: ${baseUrl}` : '[api] dữ liệu mẫu (chưa đặt EXPO_PUBLIC_API_URL)');
