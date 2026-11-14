/**
 * B4 · LLM phân tích rủi ro, rồi backend kiểm tra lại từng cảnh báo.
 */
import {
  FlagSchema,
  type Flag,
  type KeyTerms,
  type OcrLine,
  type Severity,
} from '@rental/shared';
import type { RuleResult } from '@rental/shared/src/rules';
import { verifyFlags, type DroppedFlag } from '@rental/shared/src/verify';

import type { Knowledge } from '../knowledge';
import type { Llm } from '../llm/types';
import { formatLines } from './extract';
import { RiskOutSchema, type RiskOut } from './schemas';

export type RiskResult = { flags: Flag[]; dropped: DroppedFlag[] };

export async function analyzeRisk(
  llm: Llm,
  system: string,
  knowledge: Knowledge,
  lines: OcrLine[],
  keyTerms: KeyTerms,
  ruleResults: RuleResult[],
): Promise<RiskResult> {
  const text = [
    `<contract>\n${formatLines(lines)}\n</contract>`,
    `<key_terms>${JSON.stringify(keyTerms)}</key_terms>`,
    `<rule_results>${JSON.stringify(ruleResults.filter((r) => r.checked))}</rule_results>`,
  ].join('\n');

  const out = await llm.structured({
    step: 'B4',
    system,
    content: [{ type: 'text', text }],
    schema: RiskOutSchema,
    maxTokens: 16000,
  });

  return finalizeFlags(out, knowledge, lines, ruleResults);
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Có số liệu khảo sát nào chưa? Chưa có thì what_is_common phải để trống. */
function hasNorms(knowledge: Knowledge): boolean {
  const n = knowledge.norms;
  const values = [
    n.deposit_months_typical,
    n.deposit_months_max,
    n.electricity_vnd_per_kwh_typical,
    n.electricity_max,
    n.water?.per_person_vnd_typical,
    n.water?.per_m3_vnd_typical,
    n.service_fee_vnd_typical,
    n.notice_days_typical,
  ];
  return values.some((v) => v != null);
}

type DraftFlag = Omit<Flag, 'id'>;

/** Tạo cảnh báo từ checklist khi B3 đã bắt được mà LLM bỏ sót. */
function flagFromRule(result: RuleResult, knowledge: Knowledge, lines: OcrLine[]): DraftFlag | null {
  const rule = knowledge.checklist.rules.find((r) => r.id === result.rule_id);
  if (!rule) return null;
  const type = result.flag_type ?? 'risky';
  const lineIds = type === 'missing' ? [] : result.line_ids;
  if (type !== 'missing' && lineIds.length === 0) return null;
  const byId = new Map(lines.map((l) => [l.id, l.text]));
  return {
    rule_id: rule.id,
    category: rule.category,
    type,
    severity: rule.severity,
    line_ids: lineIds,
    quote: lineIds.map((id) => byId.get(id) ?? '').join(' ').trim(),
    title: rule.description,
    explanation: `${rule.why} ${result.reason}`.trim(),
    what_is_common: '',
    question_for_landlord: rule.question,
    suggested_clause: '',
    confidence: 0.9,
  };
}

/** Phần xử lý thuần sau khi LLM trả lời (tách riêng để test). */
export function finalizeFlags(
  out: RiskOut,
  knowledge: Knowledge,
  lines: OcrLine[],
  ruleResults: RuleResult[],
): RiskResult {
  const normsAvailable = hasNorms(knowledge);

  let drafts: DraftFlag[] = out.flags.map((f) => ({
    ...f,
    confidence: Number.isFinite(f.confidence) ? Math.min(1, Math.max(0, f.confidence)) : 0.5,
    what_is_common: normsAvailable ? f.what_is_common.trim() : '',
  }));

  // B3 đã bắt được thì phải có cảnh báo, kể cả khi LLM quên.
  for (const result of ruleResults) {
    if (!result.triggered) continue;
    if (drafts.some((d) => d.rule_id === result.rule_id)) continue;
    const synthesized = flagFromRule(result, knowledge, lines);
    if (synthesized) drafts.push(synthesized);
  }

  // Bỏ trùng: cùng quy tắc, cùng dòng.
  const seen = new Set<string>();
  drafts = drafts.filter((d) => {
    const key = `${d.rule_id}|${[...d.line_ids].sort().join(',')}|${d.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const withTempIds: Flag[] = drafts.map((d, i) => ({ ...d, id: `tmp${i}` }));
  const { kept, dropped } = verifyFlags(withTempIds, lines);
  for (const d of dropped) {
    console.warn(`[B4] bỏ cảnh báo ${d.flag.rule_id} "${d.flag.title}": ${d.reason}`);
  }

  const flags = kept
    .map((k) => k.flag)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .map((f, i) => FlagSchema.parse({ ...f, id: `F${i + 1}` }));

  return { flags, dropped };
}
