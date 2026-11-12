import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { extractionSchema, pageSchema, riskSchema, termNames } from '@rental/shared';

const root = fileURLToPath(new URL('../', import.meta.url));
const catalog = JSON.parse(await readFile(path.join(root, 'data/samples/contracts.json'), 'utf8'));
const output = path.join(root, 'data/samples/generated');
await mkdir(output, { recursive: true });
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
for (const sample of catalog) {
  const width = 1600, height = 1400, x = 70, startY = 170, lineHeight = 82, fontSize = 23;
  const idFor = (i: number) => `p1-L${String(i).padStart(2, '0')}`;
  const lines = (sample.lines as string[]).map((text, index) => {
    const y = startY + index * lineHeight;
    return { id: idFor(index + 1), page_id: 'p1', raw_text: text, polygon: [{x:x/width,y:(y-30)/height},{x:(width-x)/width,y:(y-30)/height},{x:(width-x)/width,y:(y+12)/height},{x:x/width,y:(y+12)/height}] };
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><text x="70" y="70" font-family="Arial" font-size="22" fill="#9c361c">DỮ LIỆU MÔ PHỎNG — KHÔNG PHẢI HỢP ĐỒNG THẬT</text>${(sample.lines as string[]).map((t, i) => `<text x="${x}" y="${startY + i*lineHeight}" font-family="Arial" font-size="${fontSize}" fill="#142233">${escape(t)}</text>`).join('')}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(output, `${sample.id}.png`));
  const key_terms = Object.fromEntries(termNames.map(key => {
    const entry = sample.terms[key];
    const unit = key.endsWith('_vnd') ? 'VND' : key.includes('kwh') ? 'VND/kWh' : key === 'duration_months' ? 'month' : key === 'notice_days' ? 'day' : 'text';
    return [key, entry ? {value:entry[0], unit, raw_text:entry[2], line_ids:[idFor(entry[1])], status:'found'} : {value:null, unit, raw_text:'', line_ids:[], status:'not_found'}];
  }));
  const replay = {
    id: sample.id, title: sample.title, source: 'synthetic',
    pages: [pageSchema.parse({ id:'p1', width, height, lines })],
    extraction: extractionSchema.parse({ lines:lines.map(l => ({line_id:l.id, corrected_text:l.raw_text})), key_terms }),
    risk: riskSchema.parse({flags:sample.flags.map((f: any, i: number) => ({ id:`F${i+1}`, rule_id:f.rule_id, type:f.type, severity:f.severity, line_ids:f.line ? [idFor(f.line)] : [], quote:f.line ? sample.lines[f.line-1] : '', title:f.title, explanation:f.explanation, question_for_landlord:f.question_for_landlord }))}),
  };
  await writeFile(path.join(output, `${sample.id}.replay.json`), JSON.stringify(replay, null, 2) + '\n');
  console.log(`Generated ${sample.id}: synthetic image + authored OCR/LLM replay`);
}
