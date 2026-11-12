import sharp from 'sharp';
import type { ImageInput } from '../../apps/api/src/ocr.ts';
import type { BenchmarkCase } from './schema.ts';

const escapeXml = (s: string) => s.replace(/[&<>"']/gu, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[c]!));
function wrap(text: string) {
  const rows: string[] = [];
  let row = '';
  for (const word of text.split(/\s+/u)) {
    if (word.length > 88) throw new Error('RENDER_WORD_TOO_LONG');
    if (row && `${row} ${word}`.length > 88) { rows.push(row); row = ''; }
    row = row ? `${row} ${word}` : word;
  }
  if (row) rows.push(row);
  return rows;
}

export async function renderCase(item: BenchmarkCase): Promise<ImageInput[]> {
  return Promise.all(item.pages.map(async (page, index) => {
    const rows = page.flatMap(line => [...wrap(line), '']);
    const width = 1600, height = Math.max(900, rows.length * 32 + 150);
    if (height > 2400) throw new Error('RENDER_PAGE_TOO_LONG');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><text x="60" y="50" font-family="Arial" font-size="20" fill="#555">DỮ LIỆU MÔ PHỎNG — Trang ${index + 1}</text>${rows.map((row, i) => `<text x="60" y="${110+i*32}" font-family="Arial" font-size="24" fill="#111">${escapeXml(row)}</text>`).join('')}</svg>`;
    return {bytes:await sharp(Buffer.from(svg)).png().toBuffer(),width,height};
  }));
}
