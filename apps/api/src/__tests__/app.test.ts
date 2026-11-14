import path from 'node:path';

import { AnalyzeResponseSchema, ApiErrorSchema, MessageResponseSchema, type OcrLine } from '@rental/shared';
import { describe, expect, it } from 'vitest';

import { createApp, sniffImageType } from '../app';
import { REPO_ROOT } from '../config';
import { firstCodeBlock, loadKnowledge, loadPrompts } from '../knowledge';
import type { Llm } from '../llm/types';
import type { OcrProvider } from '../ocr/vision';
import { fakeLlm, found, line, notFound, unclear } from './helpers';

const knowledge = loadKnowledge(path.join(REPO_ROOT, 'data'));
const prompts = loadPrompts(path.join(REPO_ROOT, 'prompts'), knowledge);

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const PAGE1: OcrLine[] = [
  line('p1-L01', 'HOP DONG THUE PHONG TRO'),
  line('p1-L02', 'Gia thue: 3.500.000 dong/thang.'),
  line('p1-L03', 'Bên B đặt cọc 7.000.000 đồng.'),
  line('p1-L04', 'Nếu bên B chuyển đi trước hạn thì không được hoàn lại tiền cọc.'),
  line('p1-L05', 'Tiền điện: theo giá chủ nhà quy định.'),
];

function fakeOcr(pages: OcrLine[][]): OcrProvider {
  return {
    async readPages(images) {
      return images.map((_, i) => ({
        info: { page: i + 1, width: 1240, height: 1754 },
        lines: pages[i] ?? [],
      }));
    },
  };
}

const extractAnswer = {
  is_rental_contract: true,
  unreadable_pages: [],
  corrections: [
    { id: 'p1-L01', text: 'HỢP ĐỒNG THUÊ PHÒNG TRỌ' },
    { id: 'p1-L02', text: 'Giá thuê: 3.500.000 đồng/tháng.' },
    { id: 'p9-L01', text: 'dòng bịa thêm' },
  ],
  key_terms: {
    rent_vnd: found(3_500_000, ['p1-L02'], '3.500.000 đồng/tháng'),
    deposit_vnd: found(7_000_000, ['p1-L03', 'p7-L77'], '7.000.000 đồng'),
    electricity_vnd_per_kwh: unclear('theo giá chủ nhà quy định', ['p1-L05']),
    water_vnd: notFound(),
    water_unit: notFound(),
    service_fee_vnd: notFound(),
    term_months: notFound(),
    notice_days: notFound(),
  },
};

const riskFlag = {
  category: 'deposit',
  type: 'risky',
  severity: 'high',
  what_is_common: 'Thường cọc 1 tháng',
  question_for_landlord: 'Nếu em báo trước 30 ngày thì có được nhận lại cọc không ạ?',
  suggested_clause: '',
  explanation: 'Bạn có thể mất 7.000.000đ.',
};

const riskAnswer = {
  flags: [
    {
      ...riskFlag,
      rule_id: 'UTL-01',
      category: 'utilities',
      type: 'unclear',
      severity: 'medium',
      line_ids: ['p1-L05'],
      quote: 'Tiền điện: theo giá chủ nhà quy định.',
      title: 'Giá điện không ghi số',
      confidence: 0.9,
    },
    {
      ...riskFlag,
      rule_id: 'DEP-02',
      line_ids: ['p1-L04'],
      quote: 'Nếu bên B chuyển đi trước hạn thì không được hoàn lại tiền cọc.',
      title: 'Mất cọc khi trả phòng sớm',
      confidence: 1.7,
    },
    {
      ...riskFlag,
      rule_id: 'OTH-02',
      category: 'other',
      line_ids: ['p1-L03'],
      quote: 'Bên A được vào phòng bất kỳ lúc nào.',
      title: 'Cảnh báo bịa',
      confidence: 0.8,
    },
  ],
};

function setup(llmAnswers: Record<string, unknown>, ocrPages: OcrLine[][] = [PAGE1], k = knowledge) {
  const { llm, calls } = fakeLlm(llmAnswers);
  const app = createApp({ ocr: fakeOcr(ocrPages), llm, knowledge: k, prompts });
  return { app, calls };
}

function form(count: number, data: Buffer = JPEG) {
  const fd = new FormData();
  for (let i = 0; i < count; i++) {
    fd.append('pages', new File([new Uint8Array(data)], `page-${i + 1}.jpg`, { type: 'image/jpeg' }));
  }
  return fd;
}

async function errorOf(res: Response) {
  return ApiErrorSchema.parse(await res.json()).error;
}

describe('POST /analyze', () => {
  it('chạy đủ B1→B4 và trả đúng AnalyzeResponseSchema của app', async () => {
    const { app, calls } = setup({ B2: extractAnswer, B4: riskAnswer });
    const res = await app.request('/analyze', { method: 'POST', body: form(1) });
    expect(res.status).toBe(200);
    const body = AnalyzeResponseSchema.parse(await res.json());

    // B2: sửa dòng có thật, bỏ dòng bịa, bỏ line_id bịa.
    expect(body.lines.map((l) => l.text)[0]).toBe('HỢP ĐỒNG THUÊ PHÒNG TRỌ');
    expect(body.lines).toHaveLength(5);
    expect(body.key_terms.deposit_vnd.line_ids).toEqual(['p1-L03']);
    expect(body.pages).toEqual([{ page: 1, width: 1240, height: 1754 }]);

    // B4: cảnh báo bịa bị bỏ; TRM-02 do B3 bắt được nên được thêm dù LLM quên.
    const rules = body.flags.map((f) => f.rule_id);
    expect(rules).not.toContain('OTH-02');
    expect(rules).toEqual(['DEP-02', 'UTL-01', 'TRM-02']);
    expect(body.flags.map((f) => f.id)).toEqual(['F1', 'F2', 'F3']);
    expect(body.flags[0].confidence).toBe(1);
    const trm = body.flags.find((f) => f.rule_id === 'TRM-02')!;
    expect(trm).toMatchObject({ type: 'missing', line_ids: [], quote: '' });

    // Đã có market_norms → giữ what_is_common của LLM (prompt bắt chỉ lấy số từ file này).
    expect(body.flags.find((f) => f.rule_id === 'DEP-02')!.what_is_common).toBe('Thường cọc 1 tháng');

    // B2 nhận ảnh + dòng OCR; B4 nhận hợp đồng đã sửa và kết quả B3.
    expect(calls.map((c) => c.step)).toEqual(['B2', 'B4']);
    const b2 = calls[0].content;
    expect(b2.some((b) => b.type === 'image')).toBe(true);
    const b4 = calls[1].content[0];
    expect(b4.type === 'text' && b4.text).toContain('[p1-L01] HỢP ĐỒNG THUÊ PHÒNG TRỌ');
    expect(b4.type === 'text' && b4.text).toContain('"rule_id":"UTL-01"');
    expect(calls[1].system).toContain('DEP-01');
  });

  it('market_norms toàn null → what_is_common phải rỗng, không để LLM bịa', async () => {
    const empty = {
      ...knowledge,
      norms: { source: null, deposit_months_max: null, electricity_max: null, notice_days_typical: null },
    };
    const { app } = setup({ B2: extractAnswer, B4: riskAnswer }, [PAGE1], empty);
    const body = AnalyzeResponseSchema.parse(await (await app.request('/analyze', { method: 'POST', body: form(1) })).json());
    expect(body.flags.every((f) => f.what_is_common === '')).toBe(true);
  });

  it('trang không có chữ → image_unreadable kèm số trang, không gọi LLM', async () => {
    const { app, calls } = setup({}, [PAGE1, []]);
    const res = await app.request('/analyze', { method: 'POST', body: form(2) });
    expect(res.status).toBe(422);
    expect(await errorOf(res)).toMatchObject({ code: 'image_unreadable', pages: [2] });
    expect(calls).toHaveLength(0);
  });

  it('LLM báo không phải hợp đồng → not_a_contract', async () => {
    const { app } = setup({ B2: { ...extractAnswer, is_rental_contract: false } });
    const res = await app.request('/analyze', { method: 'POST', body: form(1) });
    expect((await errorOf(res)).code).toBe('not_a_contract');
  });

  it('LLM báo trang mờ → image_unreadable với đúng trang', async () => {
    const { app } = setup({ B2: { ...extractAnswer, unreadable_pages: [1, 1, 5] } });
    const res = await app.request('/analyze', { method: 'POST', body: form(1) });
    expect(await errorOf(res)).toMatchObject({ code: 'image_unreadable', pages: [1] });
  });

  it('quá 8 trang → too_many_pages', async () => {
    const { app } = setup({});
    const res = await app.request('/analyze', { method: 'POST', body: form(9) });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('too_many_pages');
  });

  it('file không phải ảnh → image_unreadable', async () => {
    const { app } = setup({});
    const res = await app.request('/analyze', { method: 'POST', body: form(1, Buffer.from('hello')) });
    expect(await errorOf(res)).toMatchObject({ code: 'image_unreadable', pages: [1] });
  });

  it('LLM lỗi → 500 internal, không lộ chi tiết', async () => {
    const llm: Llm = { label: 'fake', structured: async () => { throw new Error('secret detail'); } };
    const app = createApp({ ocr: fakeOcr([PAGE1]), llm, knowledge, prompts });
    const orig = console.error;
    console.error = () => {};
    const res = await app.request('/analyze', { method: 'POST', body: form(1) });
    console.error = orig;
    expect(res.status).toBe(500);
    const err = await errorOf(res);
    expect(err.code).toBe('internal');
    expect(err.message).not.toContain('secret');
  });
});

describe('POST /message', () => {
  const request = {
    contract_id: 'c1',
    addressing: 'chau-cochu',
    tone: 'gentle',
    flags: [
      {
        id: 'F1',
        rule_id: 'DEP-02',
        title: 'Mất cọc',
        quote: 'x',
        question_for_landlord: 'Cô chú cho cháu hỏi về tiền cọc ạ?',
        suggested_clause: '',
      },
    ],
  };

  it('soạn tin theo xưng hô đã chọn và trả đúng MessageResponseSchema', async () => {
    const { app, calls } = setup({
      B5: { message: ' Cháu chào cô chú ạ. ', questions: [], suggested_clauses: ['', 'Hoàn cọc trong 7 ngày.'] },
    });
    const res = await app.request('/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(res.status).toBe(200);
    const body = MessageResponseSchema.parse(await res.json());
    expect(body).toEqual({
      message: 'Cháu chào cô chú ạ.',
      questions: ['Cô chú cho cháu hỏi về tiền cọc ạ?'],
      suggested_clauses: ['Hoàn cọc trong 7 ngày.'],
    });
    const sent = calls[0].content[0];
    expect(sent.type === 'text' && sent.text).toContain('cháu – cô/chú');
  });

  it('không có cảnh báo nào được giữ → 400', async () => {
    const { app } = setup({});
    const res = await app.request('/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, flags: [] }),
    });
    expect(res.status).toBe(400);
  });
});

describe('prompt và tiện ích', () => {
  it('đọc đủ 4 prompt từ prompts/*.md và chèn checklist + market_norms vào prompt B4', () => {
    expect(prompts.reread).toContain('[không đọc được]');
    expect(prompts.extract).toContain('key_terms');
    expect(prompts.message).toContain('kept_flags');
    expect(prompts.risk).toContain('id: DEP-01');
    expect(prompts.risk).toContain('deposit_months_max');
    expect(prompts.risk).not.toContain('…nội dung data/checklist.yaml…');
  });

  it('firstCodeBlock báo lỗi rõ khi file prompt không có khối ```', () => {
    expect(() => firstCodeBlock('# trống', 'x.md')).toThrow('x.md');
  });

  it('nhận dạng ảnh theo nội dung file', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffImageType(Buffer.from('RIFF0000WEBP'))).toBe('image/webp');
    expect(sniffImageType(Buffer.from('%PDF'))).toBeNull();
  });
});
