import { GoogleAuth } from 'google-auth-library';
import type { Page } from '@rental/shared';
import { AppError } from './errors.ts';

type Vertex = { x?: number; y?: number };
type VisionWord = { symbols?: { text?: string; property?: { detectedBreak?: {type?: string} } }[]; boundingBox?: { vertices?: Vertex[] } };
export type VisionPage = { width?: number; height?: number; blocks?: { paragraphs?: { words?: VisionWord[] }[] }[] };
export type ImageInput = { bytes: Buffer; width: number; height: number };

export function visionPageToLines(input: VisionPage, pageId: string, width: number, height: number): Page {
  const lines: Page['lines'] = [];
  let text = '', vertices: Vertex[] = [];
  const flush = () => {
    if (!text.trim()) { text = ''; vertices = []; return; }
    const xs = vertices.map(v => v.x ?? 0), ys = vertices.map(v => v.y ?? 0);
    if (!xs.length) throw new AppError('OCR_NO_POSITION', 'OCR không có vị trí chữ; hãy thử chụp lại.');
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    const x1 = clamp(Math.min(...xs) / width), x2 = clamp(Math.max(...xs) / width);
    const y1 = clamp(Math.min(...ys) / height), y2 = clamp(Math.max(...ys) / height);
    lines.push({ id: `${pageId}-L${String(lines.length + 1).padStart(2,'0')}`, page_id:pageId, raw_text:text.trim(), polygon:[{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}] });
    text = ''; vertices = [];
  };
  for (const block of input.blocks ?? []) for (const paragraph of block.paragraphs ?? []) {
    for (const word of paragraph.words ?? []) {
      vertices.push(...(word.boundingBox?.vertices ?? []));
      for (const symbol of word.symbols ?? []) {
        text += symbol.text ?? '';
        const br = symbol.property?.detectedBreak?.type;
        if (br === 'LINE_BREAK' || br === 'EOL_SURE_SPACE') flush();
        else if (br === 'HYPHEN') { text += '-'; flush(); }
        else if (br === 'SPACE' || br === 'SURE_SPACE') text += ' ';
      }
    }
    flush();
  }
  return { id: pageId, width, height, lines };
}

export async function googleOcr(images: ImageInput[], apiKey: string): Promise<Page[]> {
  const headers: Record<string, string> = { 'Content-Type':'application/json' };
  if (apiKey) headers['x-goog-api-key'] = apiKey;
  else {
    try {
      const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-vision'] });
      const token = await auth.getAccessToken();
      if (!token) throw new Error('NO_TOKEN');
      headers.Authorization = `Bearer ${token}`;
    } catch { throw new AppError('OCR_NOT_CONFIGURED', 'Chưa có credentials Google OCR hợp lệ.', 503); }
  }
  let response: Response;
  try {
    response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method:'POST', headers, signal:AbortSignal.timeout(45000),
      body:JSON.stringify({requests:images.map(image => ({image:{content:image.bytes.toString('base64')}, features:[{type:'DOCUMENT_TEXT_DETECTION'}], imageContext:{languageHints:['vi']}}))}),
    });
  } catch { throw new AppError('OCR_UNAVAILABLE', 'Không kết nối được OCR hoặc đã quá thời gian chờ.', 504); }
  if (!response.ok) throw new AppError('OCR_PROVIDER_ERROR', `Dịch vụ OCR từ chối yêu cầu (HTTP ${response.status}).`, 502);
  const payload = await response.json() as {responses?: { error?: unknown; fullTextAnnotation?: {pages?: VisionPage[]} }[]};
  return images.map((image, i) => {
    const result = payload.responses?.[i];
    const page = result?.fullTextAnnotation?.pages?.[0];
    if (result?.error || !page) throw new AppError('OCR_NO_TEXT', `Không đọc được chữ ở trang ${i+1}. Hãy chụp lại.`, 422);
    const parsed = visionPageToLines(page, `p${i+1}`, image.width, image.height);
    if (!parsed.lines.length) throw new AppError('OCR_NO_TEXT', `Trang ${i+1} chưa có chữ đọc được.`, 422);
    return parsed;
  });
}
