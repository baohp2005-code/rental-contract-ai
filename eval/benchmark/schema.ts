import { z } from 'zod';
import { RULE_IDS } from '@rental/shared';

export const evidenceSchema = z.object({
  page: z.number().int().positive(),
  contains: z.string().trim().min(1),
}).strict();
export const goldFlagSchema = z.object({
  id: z.string().min(1), rule_id: z.enum(RULE_IDS),
  type: z.enum(['risky', 'missing', 'unclear']), severity: z.enum(['high', 'medium', 'low']),
  // Alternatives: a correct citation must identify at least one of these passages.
  evidence_any_of: z.array(evidenceSchema),
  rationale: z.string().min(1),
}).strict();
export const caseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), family: z.string().min(1),
  split: z.enum(['dev', 'holdout']), source: z.literal('synthetic'),
  title: z.string().min(1), tags: z.array(z.string()).min(1),
  review_status: z.enum(['draft', 'reviewed']), reviewers: z.array(z.string()),
  all_pages_confirmed: z.boolean(), pages: z.array(z.array(z.string().min(1)).min(1).max(28)).min(1).max(3),
  expected: z.array(goldFlagSchema),
  notes: z.string(),
}).strict();
export const datasetSchema = z.object({
  version: z.string().min(1), description: z.string().min(1),
  cases: z.array(caseSchema).min(1),
}).strict();
export type BenchmarkCase = z.infer<typeof caseSchema>;
export type GoldFlag = z.infer<typeof goldFlagSchema>;
export type Dataset = z.infer<typeof datasetSchema>;

export const normalize = (text: string) => text.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim();

export function validateDataset(input: unknown): Dataset {
  const dataset = datasetSchema.parse(input);
  const ids = new Set<string>(), families = new Map<string, string>();
  for (const item of dataset.cases) {
    if (ids.has(item.id)) throw new Error(`DUPLICATE_CASE: ${item.id}`);
    ids.add(item.id);
    if (families.has(item.family) && families.get(item.family) !== item.split) throw new Error(`SPLIT_LEAKAGE: ${item.family}`);
    families.set(item.family, item.split);
    if (item.review_status === 'reviewed' && new Set(item.reviewers).size < 2) throw new Error(`TWO_REVIEWERS_REQUIRED: ${item.id}`);
    if (item.split === 'holdout' && item.review_status !== 'reviewed') throw new Error(`HOLDOUT_NOT_REVIEWED: ${item.id}`);
    const goldIds = new Set<string>();
    for (const flag of item.expected) {
      if (goldIds.has(flag.id)) throw new Error(`DUPLICATE_GOLD: ${item.id}/${flag.id}`);
      goldIds.add(flag.id);
      if (flag.type === 'missing') {
        if (flag.evidence_any_of.length || !item.all_pages_confirmed || item.pages.flat().some(t => t.includes('[không đọc được]'))) {
          throw new Error(`INVALID_MISSING_LABEL: ${item.id}/${flag.id}`);
        }
      } else if (!flag.evidence_any_of.length) throw new Error(`EVIDENCE_REQUIRED: ${item.id}/${flag.id}`);
      for (const anchor of flag.evidence_any_of) {
        if (!normalize(item.pages[anchor.page - 1]?.join(' ') ?? '').includes(normalize(anchor.contains))) {
          throw new Error(`GOLD_EVIDENCE_NOT_IN_SOURCE: ${item.id}/${flag.id}`);
        }
      }
    }
  }
  return dataset;
}

export function coverage(cases: BenchmarkCase[]) {
  return {
    cases: cases.length,
    clean_cases: cases.filter(c => !c.expected.length).length,
    reviewed_cases: cases.filter(c => c.review_status === 'reviewed').length,
    families: new Set(cases.map(c => c.family)).size,
    by_rule: Object.fromEntries(RULE_IDS.map(rule => [rule, {
      positive_cases: cases.filter(c => c.expected.some(f => f.rule_id === rule)).length,
      negative_cases: cases.filter(c => !c.expected.some(f => f.rule_id === rule)).length,
      targeted_negative_cases: cases.filter(c => !c.expected.some(f => f.rule_id === rule) && c.tags.includes(rule)).length,
    }])),
    by_tag: Object.fromEntries([...new Set(cases.flatMap(c => c.tags))].sort().map(tag => [tag, cases.filter(c => c.tags.includes(tag)).length])),
  };
}
