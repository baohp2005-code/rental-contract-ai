import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Đọc apps/api/.env nếu có (Node ≥ 20.12). Biến môi trường thật được ưu tiên. */
export function loadEnvFile(): void {
  const file = path.join(API_ROOT, '.env');
  try {
    process.loadEnvFile(file);
  } catch {
    // Không có .env: dùng biến môi trường của hệ thống (khi deploy).
  }
}

export const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(API_ROOT, '../..');

export type Config = {
  port: number;
  dataDir: string;
  promptsDir: string;
  /** Giới hạn dung lượng mỗi ảnh (byte). */
  maxImageBytes: number;
  /** Số lượt mỗi giờ cho một IP; 0 = không giới hạn. */
  analyzePerHour: number;
  messagePerHour: number;
  /** Địa chỉ công khai khi chạy trên Render (Render tự đặt RENDER_EXTERNAL_URL). */
  publicUrl?: string;
};

function intEnv(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw?.trim() && Number.isFinite(n) ? Math.floor(n) : fallback;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 8787),
    dataDir: env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(REPO_ROOT, 'data'),
    promptsDir: env.PROMPTS_DIR ? path.resolve(env.PROMPTS_DIR) : path.join(REPO_ROOT, 'prompts'),
    maxImageBytes: 8 * 1024 * 1024,
    analyzePerHour: intEnv(env.RATE_LIMIT_ANALYZE_PER_HOUR, 0),
    messagePerHour: intEnv(env.RATE_LIMIT_MESSAGE_PER_HOUR, 0),
    publicUrl: env.PUBLIC_URL?.trim() || env.RENDER_EXTERNAL_URL?.trim() || undefined,
  };
}
