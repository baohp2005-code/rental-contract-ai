import { RULE_IDS, type AnalyzeResponse, type CheckedFlag } from '@rental/shared';
import { normalize, type BenchmarkCase, type GoldFlag } from './schema.ts';

export type Outcome = { case_id: string; status: 'completed'; result: AnalyzeResponse }
  | { case_id: string; status: 'failed'; error_code: string };

function evidenceContext(result: AnalyzeResponse, flag: CheckedFlag) {
  const lines = result.pages.flatMap((p, index) => p.lines.map(l => ({ ...l, pageNumber: index + 1 })));
  const selected = flag.line_ids.map(id => lines.find(l => l.id === id));
  const validIds = flag.line_ids.length > 0 && new Set(flag.line_ids).size === flag.line_ids.length && selected.every(Boolean);
  const text = selected.map(l => l?.raw_text ?? '').join(' ');
  return { selected, grounded: validIds && !!normalize(flag.quote) && normalize(text).includes(normalize(flag.quote)) };
}

function identifiesClause(result: AnalyzeResponse, prediction: CheckedFlag, gold: GoldFlag) {
  if (prediction.rule_id !== gold.rule_id || prediction.type !== gold.type) return false;
  if (gold.type === 'missing') return true;
  const { selected } = evidenceContext(result, prediction);
  return gold.evidence_any_of.some(anchor => normalize(selected.filter(l => l?.pageNumber === anchor.page).map(l => l!.raw_text).join(' ')).includes(normalize(anchor.contains)));
}

function supported(result: AnalyzeResponse, prediction: CheckedFlag, gold: GoldFlag) {
  if (gold.type === 'missing') return prediction.line_ids.length === 0 && !prediction.quote.trim();
  return evidenceContext(result, prediction).grounded && gold.evidence_any_of.some(anchor => {
    const selected = evidenceContext(result, prediction).selected;
    return normalize(prediction.quote).includes(normalize(anchor.contains))
      && normalize(selected.filter(l => l?.pageNumber === anchor.page).map(l => l!.raw_text).join(' ')).includes(normalize(anchor.contains));
  });
}

// Maximum one-to-one matching. Duplicates can never increase recall or evade FP.
// Prefer supported edges when choosing between predictions of the same clause.
export function matchFlags(item: BenchmarkCase, result: AnalyzeResponse) {
  const owner = new Map<number, number>();
  const edges = item.expected.map(gold => result.flags.map((flag, index) => ({ index, eligible: identifiesClause(result, flag, gold), supported: supported(result, flag, gold) }))
    .filter(e => e.eligible).sort((a, b) => Number(b.supported) - Number(a.supported)).map(e => e.index));
  function visit(goldIndex: number, visited: Set<number>): boolean {
    for (const predictionIndex of edges[goldIndex]) {
      if (visited.has(predictionIndex)) continue;
      visited.add(predictionIndex);
      const previous = owner.get(predictionIndex);
      if (previous === undefined || visit(previous, visited)) { owner.set(predictionIndex, goldIndex); return true; }
    }
    return false;
  }
  item.expected.forEach((_, index) => visit(index, new Set()));
  return [...owner].map(([prediction_index, gold_index]) => ({ prediction_index, gold_index,
    evidence_correct: supported(result, result.flags[prediction_index], item.expected[gold_index]),
    severity_correct: result.flags[prediction_index].severity === item.expected[gold_index].severity,
  })).sort((a, b) => a.gold_index - b.gold_index);
}

export function scoreCase(item: BenchmarkCase, outcome: Outcome) {
  if (outcome.case_id !== item.id) throw new Error('CASE_ID_MISMATCH');
  const result = outcome.status === 'completed' ? outcome.result : null;
  const matches = result ? matchFlags(item, result) : [];
  const matchedGold = new Set(matches.map(m => m.gold_index));
  const matchedPredictions = new Set(matches.map(m => m.prediction_index));
  const predictions = result?.flags ?? [];
  const tp = matches.length, fp = predictions.length - tp, fn = item.expected.length - tp;
  const needsEvidence = predictions.filter(f => f.type !== 'missing');
  return {
    id: item.id, status: outcome.status, error_code: outcome.status === 'failed' ? outcome.error_code : null,
    tags: item.tags, clean: item.expected.length === 0,
    tp, fp, fn,
    high_expected: item.expected.filter(f => f.severity === 'high').length,
    high_found: matches.filter(m => item.expected[m.gold_index].severity === 'high').length,
    supported_tp: matches.filter(m => m.evidence_correct).length,
    severity_correct: matches.filter(m => m.severity_correct).length,
    evidence_grounded: result ? needsEvidence.filter(f => evidenceContext(result, f).grounded).length : 0,
    evidence_total: needsEvidence.length,
    unsupported_missing: predictions.filter(f => f.type === 'missing' && (!item.all_pages_confirmed || item.pages.flat().some(t => t.includes('[không đọc được]')) || f.line_ids.length > 0 || !!f.quote.trim())).length,
    exact: !!result && fp === 0 && fn === 0 && matches.every(m => m.evidence_correct && m.severity_correct),
    matches: matches.map(m => ({ ...m, gold_id: item.expected[m.gold_index].id, prediction_id: predictions[m.prediction_index].id })),
    missed: item.expected.filter((_, index) => !matchedGold.has(index)),
    extra: predictions.filter((_, index) => !matchedPredictions.has(index)),
    by_rule: Object.fromEntries(RULE_IDS.map(rule => [rule, {
      tp: matches.filter(m => item.expected[m.gold_index].rule_id === rule).length,
      fp: predictions.filter((f, index) => f.rule_id === rule && !matchedPredictions.has(index)).length,
      fn: item.expected.filter((f, index) => f.rule_id === rule && !matchedGold.has(index)).length,
    }])),
    elapsed_ms: result?.metadata.elapsed_ms ?? null,
    input_tokens: result?.metadata.input_tokens ?? 0, output_tokens: result?.metadata.output_tokens ?? 0,
  };
}
export type CaseScore = ReturnType<typeof scoreCase>;
const ratio = (a: number, b: number) => b ? a / b : null;
const f1 = (tp: number, fp: number, fn: number) => ratio(2 * tp, 2 * tp + fp + fn);

export function summarize(scores: CaseScore[]) {
  const sum = (key: 'tp' | 'fp' | 'fn' | 'supported_tp' | 'high_found' | 'high_expected' | 'severity_correct' | 'evidence_grounded' | 'evidence_total' | 'unsupported_missing' | 'input_tokens' | 'output_tokens') => scores.reduce((s, c) => s + c[key], 0);
  const tp = sum('tp'), fp = sum('fp'), fn = sum('fn');
  const clean = scores.filter(c => c.clean), completedClean = clean.filter(c => c.status === 'completed');
  const latencies = scores.flatMap(c => c.elapsed_ms === null ? [] : [c.elapsed_ms]).sort((a, b) => a - b);
  const byRule = Object.fromEntries(RULE_IDS.map(rule => {
    const counts = scores.reduce((s, c) => ({tp: s.tp + c.by_rule[rule].tp, fp: s.fp + c.by_rule[rule].fp, fn: s.fn + c.by_rule[rule].fn}), {tp: 0, fp: 0, fn: 0});
    return [rule, {...counts, precision: ratio(counts.tp, counts.tp + counts.fp), recall: ratio(counts.tp, counts.tp + counts.fn), f1: f1(counts.tp, counts.fp, counts.fn)}];
  }));
  const activeRules = Object.values(byRule).filter(r => r.f1 !== null);
  return {
    cases: scores.length, completed: scores.filter(c => c.status === 'completed').length, failed: scores.filter(c => c.status === 'failed').length,
    tp, fp, fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), f1: f1(tp, fp, fn),
    macro_f1: activeRules.length ? activeRules.reduce((s, r) => s + r.f1!, 0) / activeRules.length : null,
    high_found: sum('high_found'), high_expected: sum('high_expected'), high_recall: ratio(sum('high_found'), sum('high_expected')),
    supported_tp: sum('supported_tp'), supported_precision: ratio(sum('supported_tp'), tp + fp),
    severity_accuracy_on_matches: ratio(sum('severity_correct'), tp),
    evidence_grounded: sum('evidence_grounded'), evidence_total: sum('evidence_total'), evidence_grounding_rate: ratio(sum('evidence_grounded'), sum('evidence_total')),
    unsupported_missing: sum('unsupported_missing'),
    exact_cases: scores.filter(c => c.exact).length, exact_case_rate: ratio(scores.filter(c => c.exact).length, scores.length),
    clean_cases: clean.length, completed_clean_cases: completedClean.length,
    clean_false_alarm_cases: completedClean.filter(c => c.fp > 0).length,
    clean_false_alarm_rate: ratio(completedClean.filter(c => c.fp > 0).length, completedClean.length),
    clean_success_rate: ratio(clean.filter(c => c.exact).length, clean.length),
    input_tokens: sum('input_tokens'), output_tokens: sum('output_tokens'),
    latency_ms: { median: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null, p95: latencies.length ? latencies[Math.ceil(latencies.length * 0.95) - 1] : null, count: latencies.length },
    by_rule: byRule,
  };
}
