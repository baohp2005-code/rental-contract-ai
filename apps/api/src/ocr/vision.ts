/**
 * B1 · OCR bằng Google Cloud Vision (DOCUMENT_TEXT_DETECTION), gọi thẳng REST
 * như nhánh develop. Hai cách xác thực:
 *   - GOOGLE_CLOUD_VISION_API_KEY: API key (dễ nhất, dùng chung project của nhóm được)
 *   - GOOGLE_APPLICATION_CREDENTIALS: file service account JSON
 * Có API key thì dùng API key.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { GoogleAuth } from 'google-auth-library';

import { ApiFailure } from '../pipeline/errors';
import { annotationToLines, type PageLines, type VisionTextAnnotation } from './lines';

export interface OcrProvider {
  /** Mỗi ảnh là một trang, theo đúng thứ tự. */
  readPages(images: Buffer[]): Promise<PageLines[]>;
}

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';
const TIMEOUT_MS = 45_000;

/**
 * Kiểm tra cấu hình lúc khởi động để báo lỗi rõ ngay, thay vì lúc sinh viên
 * đang chờ kết quả. Trả về câu cảnh báo, hoặc null nếu ổn.
 */
export function checkVisionCredentials(env: NodeJS.ProcessEnv, baseDir: string): string | null {
  if (env.GOOGLE_CLOUD_VISION_API_KEY?.trim()) return null;
  const raw = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!raw) {
    return 'Chưa có GOOGLE_CLOUD_VISION_API_KEY hay GOOGLE_APPLICATION_CREDENTIALS: OCR chỉ chạy được nếu máy đã đăng nhập gcloud (gcloud auth application-default login).';
  }
  const file = path.resolve(baseDir, raw);
  if (!existsSync(file)) {
    return `Không thấy file service account: ${file}. Đặt file JSON đúng chỗ này, hoặc dùng GOOGLE_CLOUD_VISION_API_KEY.`;
  }
  // Thư viện Google đọc đường dẫn tương đối theo thư mục đang chạy; đổi sang tuyệt đối cho chắc.
  env.GOOGLE_APPLICATION_CREDENTIALS = file;
  return null;
}

type VisionResponse = {
  responses?: {
    error?: { message?: string };
    fullTextAnnotation?: VisionTextAnnotation;
  }[];
};

export function createVisionOcr(env: NodeJS.ProcessEnv = process.env): OcrProvider {
  const apiKey = env.GOOGLE_CLOUD_VISION_API_KEY?.trim();
  const auth = apiKey ? null : new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-vision'] });

  async function headers(): Promise<Record<string, string>> {
    if (apiKey) return { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
    try {
      const token = await auth!.getAccessToken();
      if (!token) throw new Error('no token');
      return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    } catch (err) {
      console.error('[B1] Không lấy được token Google:', err instanceof Error ? err.message : err);
      throw new ApiFailure('internal', 'Máy chủ chưa cấu hình được Google OCR.', 500);
    }
  }

  return {
    async readPages(images) {
      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: await headers(),
          signal: AbortSignal.timeout(TIMEOUT_MS),
          body: JSON.stringify({
            requests: images.map((content) => ({
              image: { content: content.toString('base64') },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
              imageContext: { languageHints: ['vi'] },
            })),
          }),
        });
      } catch (err) {
        if (err instanceof ApiFailure) throw err;
        console.error('[B1] Không gọi được Vision:', err instanceof Error ? err.message : err);
        throw new ApiFailure('internal', 'Không kết nối được dịch vụ OCR, thử lại sau.', 502);
      }

      if (!response.ok) {
        // In lý do của Google ra terminal (thường là chưa bật API, chưa bật thanh toán, key sai).
        const detail = await response.text().catch(() => '');
        console.error(`[B1] Vision HTTP ${response.status}: ${detail.slice(0, 500)}`);
        throw new ApiFailure('internal', `Dịch vụ OCR từ chối yêu cầu (HTTP ${response.status}).`, 502);
      }

      const payload = (await response.json()) as VisionResponse;
      return images.map((_, index) => {
        const result = payload.responses?.[index];
        if (result?.error?.message) {
          console.error(`[B1] Vision lỗi ở trang ${index + 1}: ${result.error.message}`);
        }
        return annotationToLines(index + 1, result?.fullTextAnnotation ?? null);
      });
    },
  };
}
