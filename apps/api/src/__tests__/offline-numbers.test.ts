import path from 'node:path';

import { AnalyzeResponseSchema, MessageResponseSchema, type OcrLine } from '@rental/shared';
import { describe, expect, it, vi } from 'vitest';

import sampleOcr from '../../../mobile/src/mocks/sample-ocr.json';
import { createApp } from '../app';
import { REPO_ROOT } from '../config';
import { loadKnowledge, loadPrompts } from '../knowledge';
import type { OcrProvider } from '../ocr/vision';
import { applyExtract } from '../pipeline/extract';
import { digitSignature, findMoney, sameDigits } from '../pipeline/numbers';
import { extractOffline } from '../pipeline/offline';
import { found, line, notFound } from './helpers';

const knowledge = loadKnowledge(path.join(REPO_ROOT, 'data'));
const prompts = loadPrompts(path.join(REPO_ROOT, 'prompts'), knowledge);
const SAMPLE: OcrLine[] = (sampleOcr as { lines: OcrLine[] }).lines;

describe('đọc số tiền', () => {
  it.each([
    ['Giá thuê: 3.500.000 đồng/tháng, trước ngày 05', [3_500_000]],
    ['cọc 3,5 triệu', [3_500_000]],
    ['cọc 3tr5', [3_500_000]],
    ['điện 3k8/số', [3_800]],
    ['điện 3.800đ/số', [3_800]],
    ['4.000 VNĐ/kWh', [4_000]],
    ['phòng số 203, 18 m2, ngày 05', []],
  ])('%s', (text, expected) => {
    expect(findMoney(text).map((m) => m.value)).toEqual(expected);
  });

  it('so chữ số, chấp nhận lỗi O/0 của OCR', () => {
    expect(digitSignature('3.500.000 đồng, ngày 05')).toBe('3500000|05');
    expect(sameDigits('Gia thue: 3.5OO.OOO dong', 'Giá thuê: 3.500.000 đồng')).toBe(true);
    expect(sameDigits('3.500.000', '5.500.000')).toBe(false);
  });
});

describe('B2 · chặn AI sửa sai con số', () => {
  const ocr = [line('p1-L01', 'Gia thue: 3.500.000 dong/thang'), line('p1-L02', 'Coc: 7.000.000 dong')];
  const base = {
    is_rental_contract: true,
    unreadable_pages: [],
    key_terms: {
      rent_vnd: found(3_500_000, ['p1-L01']),
      deposit_vnd: found(7_000_000, ['p1-L02']),
      electricity_vnd_per_kwh: notFound(),
      water_vnd: notFound(),
      water_unit: notFound(),
      service_fee_vnd: notFound(),
      term_months: notFound(),
      notice_days: notFound(),
    },
  };

  it('bỏ bản sửa làm đổi con số, giữ bản sửa chỉ thêm dấu', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = applyExtract(
      {
        ...base,
        corrections: [
          { id: 'p1-L01', text: 'Giá thuê: 5.500.000 đồng/tháng' },
          { id: 'p1-L02', text: 'Cọc: 7.000.000 đồng' },
        ],
      },
      ocr,
      1,
    );
    warn.mockRestore();
    expect(r.lines.map((l) => l.text)).toEqual(['Gia thue: 3.500.000 dong/thang', 'Cọc: 7.000.000 đồng']);
  });

  it('số tiền không có trên dòng trích dẫn → unclear', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = applyExtract(
      { ...base, corrections: [], key_terms: { ...base.key_terms, deposit_vnd: found(9_000_000, ['p1-L02']) } },
      ocr,
      1,
    );
    warn.mockRestore();
    expect(r.keyTerms.deposit_vnd).toMatchObject({ value: null, status: 'unclear' });
    expect(r.keyTerms.rent_vnd).toMatchObject({ value: 3_500_000, status: 'found' });
  });
});

describe('chế độ không AI trên hợp đồng mẫu của app', () => {
  it('đọc đúng các khoản chính như bản mẫu của app', () => {
    const { keyTerms, isRentalContract } = extractOffline(SAMPLE);
    expect(isRentalContract).toBe(true);
    expect(keyTerms.rent_vnd).toMatchObject({ value: 3_500_000, line_ids: ['p1-L09'], status: 'found' });
    expect(keyTerms.deposit_vnd).toMatchObject({ value: 7_000_000, line_ids: ['p1-L11'], status: 'found' });
    expect(keyTerms.electricity_vnd_per_kwh).toMatchObject({ line_ids: ['p1-L13'], status: 'unclear' });
    expect(keyTerms.water_vnd).toMatchObject({ value: 100_000, line_ids: ['p1-L13'] });
    expect(keyTerms.water_unit).toMatchObject({ value: 'per_person' });
    expect(keyTerms.service_fee_vnd).toMatchObject({ value: 150_000, line_ids: ['p1-L14'] });
    expect(keyTerms.term_months).toMatchObject({ value: 12, line_ids: ['p1-L08'] });
    expect(keyTerms.notice_days.status).toBe('not_found');
  });

  it('POST /analyze chạy trọn luồng không cần key, POST /message ghép tin theo xưng hô', async () => {
    const ocr: OcrProvider = {
      async readPages(images) {
        return images.map((_, i) => ({
          info: { page: i + 1, width: 1240, height: 1754 },
          lines: SAMPLE.filter((l) => l.page === i + 1),
        }));
      },
    };
    const app = createApp({ ocr, llm: null, knowledge, prompts });
    const fd = new FormData();
    for (let i = 0; i < 2; i++) fd.append('pages', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], `p${i}.jpg`));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await app.request('/analyze', { method: 'POST', body: fd });
    log.mockRestore();
    expect(res.status).toBe(200);
    const body = AnalyzeResponseSchema.parse(await res.json());
    const rules = body.flags.map((f) => f.rule_id).sort();
    // Mẫu của app có 11 cảnh báo; chế độ không AI bắt được 10, chỉ thiếu UTL-02
    // (phí dịch vụ không ghi gồm những gì) vì cần hiểu nghĩa, từ khóa không đủ.
    expect(rules).toEqual(
      ['DEP-01', 'DEP-02', 'OTH-01', 'OTH-02', 'OTH-04', 'REP-01', 'RNT-01', 'TRM-01', 'TRM-02', 'UTL-01'].sort(),
    );
    for (const f of body.flags.filter((x) => x.type !== 'missing')) {
      expect(f.quote).toBe(SAMPLE.find((l) => l.id === f.line_ids[0])!.text);
    }

    const msg = await app.request('/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contract_id: body.contract_id,
        addressing: 'chau-cochu',
        tone: 'gentle',
        flags: body.flags.slice(0, 2).map((f) => ({
          id: f.id,
          rule_id: f.rule_id,
          title: f.title,
          quote: f.quote,
          question_for_landlord: f.question_for_landlord,
          suggested_clause: f.suggested_clause,
        })),
      }),
    });
    const m = MessageResponseSchema.parse(await msg.json());
    expect(m.message.startsWith('Cháu chào cô/chú ạ.')).toBe(true);
    expect(m.message).toContain('1. ');
    expect(m.questions).toHaveLength(2);
  });
});
