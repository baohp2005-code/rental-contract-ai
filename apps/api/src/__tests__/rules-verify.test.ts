import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { Flag } from '@rental/shared';
import { runRuleChecks } from '@rental/shared/src/rules';
import { normalizeText, verifyFlags, FUZZY_MAX_CONFIDENCE } from '@rental/shared/src/verify';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from '../config';
import { loadKnowledge } from '../knowledge';
import { found, line, notFound, terms, unclear } from './helpers';

const knowledge = loadKnowledge(path.join(REPO_ROOT, 'data'));
const NO_NORMS = knowledge.norms;
const NORMS = { ...knowledge.norms, deposit_months_max: 1, electricity_max: 4000 };

describe('B3 · runRuleChecks', () => {
  const byId = (results: ReturnType<typeof runRuleChecks>) =>
    Object.fromEntries(results.map((r) => [r.rule_id, r]));

  it('chỉ chạy các quy tắc auto trong checklist thật', () => {
    const ids = runRuleChecks(terms(), knowledge.checklist, NO_NORMS).map((r) => r.rule_id);
    expect(ids.sort()).toEqual(['DEP-04', 'TRM-02', 'UTL-01']);
  });

  it('chưa có ngưỡng thì bỏ qua DEP-04 và UTL-01 thay vì tự bịa', () => {
    const r = byId(
      runRuleChecks(
        terms({ rent_vnd: found(3_500_000), deposit_vnd: found(7_000_000), electricity_vnd_per_kwh: found(5000) }),
        knowledge.checklist,
        NO_NORMS,
      ),
    );
    expect(r['DEP-04']).toMatchObject({ checked: false, triggered: false });
    expect(r['UTL-01']).toMatchObject({ checked: false, triggered: false });
  });

  it('DEP-04: cọc 2 tháng vượt ngưỡng 1 tháng', () => {
    const r = byId(
      runRuleChecks(
        terms({ rent_vnd: found(3_500_000, ['p1-L08']), deposit_vnd: found(7_000_000, ['p1-L11']) }),
        knowledge.checklist,
        NORMS,
      ),
    );
    expect(r['DEP-04']).toMatchObject({ checked: true, triggered: true, flag_type: 'risky' });
    expect(r['DEP-04'].line_ids).toEqual(['p1-L11', 'p1-L08']);
    expect(r['DEP-04'].reason).toContain('2 tháng');
  });

  it('UTL-01: "theo giá chủ nhà" (unclear) luôn bị bắt, kể cả khi chưa có ngưỡng', () => {
    const r = byId(
      runRuleChecks(
        terms({ electricity_vnd_per_kwh: unclear('theo giá chủ nhà quy định', ['p1-L13']) }),
        knowledge.checklist,
        NO_NORMS,
      ),
    );
    expect(r['UTL-01']).toMatchObject({ triggered: true, flag_type: 'unclear', line_ids: ['p1-L13'] });
  });

  it('UTL-01: giá điện vượt ngưỡng', () => {
    const r = byId(runRuleChecks(terms({ electricity_vnd_per_kwh: found(4500) }), knowledge.checklist, NORMS));
    expect(r['UTL-01']).toMatchObject({ triggered: true, flag_type: 'risky' });
  });

  it('TRM-02: không ghi báo trước → missing; có ghi → không bắt', () => {
    expect(byId(runRuleChecks(terms(), knowledge.checklist, NO_NORMS))['TRM-02']).toMatchObject({
      triggered: true,
      flag_type: 'missing',
      line_ids: [],
    });
    expect(
      byId(runRuleChecks(terms({ notice_days: found(30) }), knowledge.checklist, NO_NORMS))['TRM-02'].triggered,
    ).toBe(false);
  });
});

function flag(overrides: Partial<Flag>): Flag {
  return {
    id: 'F1',
    rule_id: 'DEP-02',
    category: 'deposit',
    type: 'risky',
    severity: 'high',
    line_ids: ['p1-L02'],
    quote: '',
    title: 't',
    explanation: 'e',
    what_is_common: '',
    question_for_landlord: 'q',
    suggested_clause: '',
    confidence: 0.9,
    ...overrides,
  };
}

describe('verifyFlags (chặn AI bịa)', () => {
  const lines = [
    line('p1-L01', 'HỢP ĐỒNG THUÊ PHÒNG TRỌ'),
    line('p1-L02', 'Bên B đặt cọc 2 tháng tiền nhà, nếu chuyển đi trước hạn'),
    line('p1-L03', 'sẽ không được hoàn cọc.'),
    line('p1-L04', 'Tiền điện: theo giá chủ nhà quy định.'),
  ];

  it('khớp nguyên văn, bỏ qua hoa thường, dấu câu và ngoặc kép', () => {
    const { kept } = verifyFlags([flag({ quote: '"bên b đặt cọc 2 tháng tiền nhà"' })], lines);
    expect(kept[0].outcome).toBe('exact');
  });

  it('câu trích trải qua 2 dòng, có dấu "…" lược bớt', () => {
    const { kept } = verifyFlags(
      [flag({ line_ids: ['p1-L02', 'p1-L03'], quote: 'Bên B đặt cọc … sẽ không được hoàn cọc.' })],
      lines,
    );
    expect(kept[0].outcome).toBe('exact');
  });

  it('dấu tiếng Việt sai là không khớp ("cốc" ≠ "cọc")', () => {
    expect(normalizeText('cốc')).not.toBe(normalizeText('cọc'));
  });

  it('mã dòng sai nhưng câu trích có ở dòng khác → sửa lại mã dòng', () => {
    const { kept } = verifyFlags([flag({ line_ids: ['p1-L01'], quote: 'theo giá chủ nhà quy định' })], lines);
    expect(kept[0]).toMatchObject({ outcome: 'relocated', flag: { line_ids: ['p1-L04'] } });
    expect(kept[0].flag.confidence).toBeLessThan(0.9);
  });

  it('khớp gần đúng → giữ nhưng hạ độ tin cậy để app ghi "AI không chắc"', () => {
    const { kept } = verifyFlags(
      [flag({ quote: 'Bên B đặt cọc 2 tháng tiền phòng, nếu chuyển đi trước hạn' })],
      lines,
    );
    expect(kept[0].outcome).toBe('fuzzy');
    expect(kept[0].flag.confidence).toBe(FUZZY_MAX_CONFIDENCE);
  });

  it('câu trích bịa hoặc mã dòng không tồn tại → bỏ cảnh báo', () => {
    const { kept, dropped } = verifyFlags(
      [
        flag({ quote: 'Bên A được vào phòng bất kỳ lúc nào' }),
        flag({ line_ids: ['p9-L99'], quote: 'không có thật' }),
        flag({ quote: '' }),
      ],
      lines,
    );
    expect(kept).toHaveLength(0);
    expect(dropped).toHaveLength(3);
  });

  it('cảnh báo "missing" luôn có line_ids và quote rỗng', () => {
    const { kept } = verifyFlags([flag({ type: 'missing', line_ids: ['p1-L01'], quote: 'x' })], lines);
    expect(kept[0].flag).toMatchObject({ line_ids: [], quote: '' });
  });

  it('11 cảnh báo mẫu của app đều khớp với 20 dòng của hợp đồng mẫu', async () => {
    const { sampleAnalysis } = await loadMobileSample();
    const { kept, dropped } = verifyFlags(sampleAnalysis.flags, sampleAnalysis.lines);
    expect(dropped).toEqual([]);
    expect(kept.every((k) => k.outcome === 'exact' || k.outcome === 'missing_type')).toBe(true);
  });
});

describe('Hợp đồng mẫu của app qua B3', () => {
  it('bắt được UTL-01 (giá điện không rõ) và TRM-02 (không ghi báo trước)', async () => {
    const { sampleAnalysis } = await loadMobileSample();
    const triggered = runRuleChecks(sampleAnalysis.key_terms, knowledge.checklist, NO_NORMS)
      .filter((r) => r.triggered)
      .map((r) => r.rule_id);
    expect(triggered.sort()).toEqual(['TRM-02', 'UTL-01']);
    // Mẫu của app cũng có 2 cảnh báo này.
    const sampleRules = sampleAnalysis.flags.map((f) => f.rule_id);
    expect(sampleRules).toEqual(expect.arrayContaining(['TRM-02', 'UTL-01']));
  });
});

async function loadMobileSample() {
  const file = path.join(REPO_ROOT, 'apps/mobile/src/mocks/sample-analysis.ts');
  readFileSync(file); // báo lỗi rõ nếu file mẫu bị dời đi
  const { sampleAnalysis } = await import('../../../mobile/src/mocks/sample-analysis');
  return { sampleAnalysis };
}
