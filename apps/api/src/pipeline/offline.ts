/**
 * Chế độ không AI (LLM_PROVIDER=none): thay B2 và B4 bằng quy tắc viết sẵn.
 *
 * Dùng khi chưa có key LLM, hoặc làm phương án dự phòng lúc demo. OCR vẫn là
 * Google Vision thật. Chỉ bắt được cách viết quen thuộc, nên mọi cảnh báo ở
 * đây ghi rõ "phát hiện bằng từ khóa" để sinh viên biết mà kiểm tra lại.
 */
import type { Flag, KeyTerm, KeyTerms, MessageRequest, MessageResponse, OcrLine } from '@rental/shared';

import type { Knowledge } from '../knowledge';
import type { ExtractResult } from './extract';
import { findMoney } from './numbers';

/** Chữ thường, bỏ dấu, để so từ khóa không phụ thuộc OCR có đọc đúng dấu hay không. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

type Segment = { lineId: string; text: string; folded: string };

/** Tách mỗi dòng thành các câu ngắn ("Tiền điện: …. Tiền nước: …" thành 2 đoạn). */
function segments(lines: OcrLine[]): Segment[] {
  return lines.flatMap((l) =>
    l.text
      .split(/(?<=[.;])\s+(?=\p{Lu})|;\s*/u)
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ lineId: l.id, text, folded: fold(text) })),
  );
}

const notFound = (): KeyTerm<never> => ({ value: null, raw_text: '', line_ids: [], status: 'not_found' });

function moneyTerm(segs: Segment[], keyword: RegExp, exclude?: RegExp): KeyTerm<number> {
  for (const s of segs) {
    if (!keyword.test(s.folded) || exclude?.test(s.folded)) continue;
    const money = findMoney(s.text)[0];
    if (money) return { value: money.value, raw_text: s.text, line_ids: [s.lineId], status: 'found' };
  }
  return notFound();
}

function durationTerm(segs: Segment[], keyword: RegExp, unitDays: boolean): KeyTerm<number> {
  for (const s of segs) {
    if (!keyword.test(s.folded)) continue;
    const m = s.folded.match(/(\d+)\s*(ngay|tuan|thang|nam)/);
    if (!m) return { value: null, raw_text: s.text, line_ids: [s.lineId], status: 'unclear' };
    const n = Number(m[1]);
    const days = { ngay: 1, tuan: 7, thang: 30, nam: 365 }[m[2] as 'ngay'];
    const months = { ngay: 1 / 30, tuan: 7 / 30, thang: 1, nam: 12 }[m[2] as 'ngay'];
    const value = Math.round(unitDays ? n * days : n * months);
    return { value, raw_text: s.text, line_ids: [s.lineId], status: 'found' };
  }
  return notFound();
}

/** B2 không AI: đọc các khoản chính bằng từ khóa. */
export function extractOffline(lines: OcrLine[]): ExtractResult {
  const segs = segments(lines);
  const all = fold(lines.map((l) => l.text).join(' '));

  // Giá điện: có số → found; có nhắc nhưng "theo chủ nhà"/"theo quy định" → unclear.
  let electricity: KeyTerm<number> = moneyTerm(segs, /(tien|gia) dien|dien\s*:/);
  if (electricity.status === 'not_found') {
    const s = segs.find((x) => /(tien|gia) dien|dien\s*:/.test(x.folded));
    if (s) {
      const raw = s.text.replace(/^.*?(?:điện|dien)\s*:?\s*/iu, '').trim() || s.text;
      electricity = { value: null, raw_text: raw, line_ids: [s.lineId], status: 'unclear' };
    }
  }

  const water = moneyTerm(segs, /(tien|gia) nuoc|nuoc\s*:/);
  const waterSeg = segs.find((x) => x.lineId === water.line_ids[0] && /nuoc/.test(x.folded));
  const waterUnit: KeyTerm<'per_person' | 'per_m3'> = !waterSeg
    ? notFound()
    : /nguoi/.test(waterSeg.folded)
      ? { value: 'per_person', raw_text: waterSeg.text, line_ids: [waterSeg.lineId], status: 'found' }
      : /(m3|khoi|m³)/.test(waterSeg.folded)
        ? { value: 'per_m3', raw_text: waterSeg.text, line_ids: [waterSeg.lineId], status: 'found' }
        : { value: null, raw_text: waterSeg.text, line_ids: [waterSeg.lineId], status: 'unclear' };

  const keyTerms: KeyTerms = {
    rent_vnd: moneyTerm(segs, /(gia thue|tien thue|tien phong|tien nha)/, /coc/),
    deposit_vnd: moneyTerm(segs, /(dat coc|tien coc)/),
    electricity_vnd_per_kwh: electricity,
    water_vnd: water,
    water_unit: waterUnit,
    service_fee_vnd: moneyTerm(segs, /(phi dich vu|dich vu)/),
    term_months: durationTerm(segs, /thoi han (thue|hop dong)/, false),
    notice_days: durationTerm(segs, /bao truoc/, true),
  };

  return {
    isRentalContract: /thue/.test(all) && /(hop dong|ben a|ben cho thue)/.test(all),
    unreadablePages: [],
    lines,
    keyTerms,
  };
}

/**
 * B4 không AI: cảnh báo theo từ khóa cho các quy tắc auto:false.
 * risky: câu chứa từ khóa xấu. missing: cả hợp đồng không nhắc tới.
 */
type KeywordRule =
  | { rule_id: string; type: 'risky'; match: (folded: string) => boolean }
  | { rule_id: string; type: 'missing'; mentioned: (allFolded: string) => boolean };

const KEYWORD_RULES: KeywordRule[] = [
  {
    rule_id: 'DEP-02',
    type: 'risky',
    match: (t) => /(khong (duoc )?(hoan|tra) lai|mat) (tien )?coc/.test(t) && /(truoc han|chuyen di|tra phong|cham dut)/.test(t),
  },
  {
    rule_id: 'RNT-01',
    type: 'risky',
    match: (t) => /(dieu chinh|tang) gia/.test(t) && /(khi can|bat ky|tuy y|khi co nhu cau|bat cu)/.test(t),
  },
  { rule_id: 'REP-01', type: 'risky', match: (t) => /(toan bo|moi|tat ca) (chi phi )?sua chua/.test(t) },
  {
    rule_id: 'TRM-01',
    type: 'risky',
    match: (t) =>
      /(cham dut|lay lai phong|thu hoi phong)/.test(t) &&
      /(khi co nhu cau|bat ky luc nao|tuy y|khong can bao truoc|bat cu luc nao)/.test(t),
  },
  { rule_id: 'OTH-02', type: 'risky', match: (t) => /vao (kiem tra )?phong (bat ky|bat cu) luc nao/.test(t) },
  { rule_id: 'DEP-01', type: 'missing', mentioned: (t) => /(hoan|tra) (lai )?(tien )?coc/.test(t) && /trong (vong )?\d+ ngay/.test(t) },
  { rule_id: 'OTH-01', type: 'missing', mentioned: (t) => /(bien ban|danh sach|hien trang|ban giao)/.test(t) },
  { rule_id: 'OTH-04', type: 'missing', mentioned: (t) => /tam tru/.test(t) },
];

const OFFLINE_NOTE = 'Phát hiện bằng từ khóa (chế độ không AI), hãy đọc lại câu gốc để chắc chắn.';

export function keywordFlags(lines: OcrLine[], knowledge: Knowledge): Omit<Flag, 'id'>[] {
  const all = fold(lines.map((l) => l.text).join(' '));
  const flags: Omit<Flag, 'id'>[] = [];
  for (const kr of KEYWORD_RULES) {
    const rule = knowledge.checklist.rules.find((r) => r.id === kr.rule_id);
    if (!rule) continue;
    const base = {
      rule_id: rule.id,
      category: rule.category,
      severity: rule.severity,
      title: rule.description,
      explanation: `${rule.why} ${OFFLINE_NOTE}`,
      what_is_common: '',
      question_for_landlord: rule.question,
      suggested_clause: '',
      confidence: 0.7,
    };
    if (kr.type === 'risky') {
      // Thử từng dòng, rồi từng cặp dòng liền nhau (câu bị xuống dòng giữa chừng).
      const single = lines.find((l) => kr.match(fold(l.text)));
      const pairAt = single
        ? -1
        : lines.findIndex(
            (l, i) => i + 1 < lines.length && lines[i + 1].page === l.page && kr.match(fold(`${l.text} ${lines[i + 1].text}`)),
          );
      const hit = single ? [single] : pairAt >= 0 ? [lines[pairAt], lines[pairAt + 1]] : [];
      if (hit.length > 0) {
        flags.push({ ...base, type: 'risky', line_ids: hit.map((l) => l.id), quote: hit.map((l) => l.text).join(' ') });
      }
    } else if (!kr.mentioned(all)) {
      flags.push({ ...base, type: 'missing', line_ids: [], quote: '' });
    }
  }
  return flags;
}

/** B5 không AI: ghép tin nhắn từ câu hỏi sinh viên đã duyệt. */
export function composeMessageOffline(request: MessageRequest): MessageResponse {
  const [me, you] = request.addressing === 'chau-cochu' ? ['cháu', 'cô/chú'] : ['em', 'anh/chị'];
  const Me = me[0].toUpperCase() + me.slice(1);
  const questions = request.flags.map((f) => f.question_for_landlord.trim()).filter(Boolean);
  const intro =
    request.tone === 'direct'
      ? `${Me} chào ${you}. Trước khi ký hợp đồng, ${me} cần ${you} làm rõ mấy điểm sau:`
      : `${Me} chào ${you} ạ. ${Me} đã đọc hợp đồng và muốn hỏi thêm vài điểm cho rõ trước khi ký ạ:`;
  const outro = request.tone === 'direct' ? `${Me} cảm ơn ${you}.` : `${Me} cảm ơn ${you} nhiều ạ!`;
  return {
    message: [intro, ...questions.map((q, i) => `${i + 1}. ${q}`), outro].join('\n'),
    questions,
    suggested_clauses: request.flags.map((f) => f.suggested_clause.trim()).filter(Boolean),
  };
}
