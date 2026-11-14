import { createHttpClient } from './http';
import { createMockClient } from './mock';
import type { ApiClient } from './types';

export * from './types';

/** Backend chung của nhóm trên Render (xem docs/DEPLOY.md). Đổi địa chỉ thì sửa ở đây. */
export const DEFAULT_API_URL = 'https://rental-contract-api.onrender.com';

/**
 * Chọn backend theo EXPO_PUBLIC_API_URL (file apps/mobile/.env):
 *   - không đặt          → backend chung trên Render (pull về là chạy được)
 *   - "mock"             → dữ liệu mẫu, không cần mạng (làm giao diện)
 *   - một địa chỉ khác   → backend đó, ví dụ http://192.168.1.23:8787 khi chạy backend trên máy mình
 */
export function resolveApiUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return DEFAULT_API_URL;
  if (value.toLowerCase() === 'mock') return null;
  return value;
}

const baseUrl = resolveApiUrl(process.env.EXPO_PUBLIC_API_URL);

export const api: ApiClient = baseUrl ? createHttpClient(baseUrl) : createMockClient();

console.log(baseUrl ? `[api] backend: ${baseUrl}` : '[api] dữ liệu mẫu (EXPO_PUBLIC_API_URL=mock)');
