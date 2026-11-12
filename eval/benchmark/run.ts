import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { analyzeResponseSchema } from '@rental/shared';
import { ROOT, getConfig } from '../../apps/api/src/config.ts';
import { analyzeLive } from '../../apps/api/src/pipeline.ts';
import { AppError } from '../../apps/api/src/errors.ts';
import { dataset } from './data.ts';
import { coverage } from './schema.ts';
import { renderCase } from './render.ts';
import { scoreCase, summarize, type Outcome } from './score.ts';

const outcomeSchema = z.discriminatedUnion('status', [
  z.object({case_id:z.string(),status:z.literal('completed'),result:analyzeResponseSchema}),
  z.object({case_id:z.string(),status:z.literal('failed'),error_code:z.string()}),
]);
const savedSchema = z.object({dataset_hash:z.string(), provenance:z.record(z.string(),z.unknown()), outcomes:z.array(outcomeSchema)});
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const percent = (value: number | null) => value === null ? 'N/A' : `${(value*100).toFixed(1)}%`;
const rootReports = path.join(ROOT,'eval/reports/benchmark');
const {values} = parseArgs({options:{
  mode:{type:'string',default:'validate'}, split:{type:'string',default:'dev'},
  ids:{type:'string'}, limit:{type:'string'}, input:{type:'string'}, compare:{type:'string'},
},strict:true});
if (!['validate','live','saved'].includes(values.mode!)) throw new Error('MODE_MUST_BE_validate_live_saved');
if (!['dev','holdout'].includes(values.split!)) throw new Error('SPLIT_MUST_BE_dev_holdout');
if (values.mode !== 'saved' && values.input) throw new Error('INPUT_ONLY_FOR_SAVED_MODE');
if (values.mode === 'saved' && !values.input) throw new Error('SAVED_MODE_REQUIRES_INPUT');
const splitCases = dataset.cases.filter(c => c.split === values.split);
if (!splitCases.length) throw new Error('EMPTY_SPLIT: holdout must be independently authored and reviewed before use');
let cases = splitCases;
if (values.ids) {
  const ids = values.ids.split(',');
  if (new Set(ids).size !== ids.length || ids.some(id => !cases.some(c => c.id === id))) throw new Error('UNKNOWN_OR_DUPLICATE_CASE_ID');
  cases = cases.filter(c => ids.includes(c.id));
}
if (values.limit) {
  if (!/^[1-9]\d*$/u.test(values.limit)) throw new Error('INVALID_LIMIT');
  cases = cases.slice(0, Number(values.limit));
}
const datasetHash = hash(JSON.stringify(dataset));
const evaluatorHash = hash((await Promise.all(['score.ts','schema.ts','run.ts'].map(file=>readFile(new URL(file,import.meta.url),'utf8')))).join('\n'));
const manifest = {dataset_version:dataset.version,dataset_hash:datasetHash,description:dataset.description,coverage:coverage(cases),holdout_cases:dataset.cases.filter(c=>c.split==='holdout').length};
if (values.mode === 'validate') {
  await mkdir(rootReports,{recursive:true});
  await writeFile(path.join(rootReports,'manifest.json'),JSON.stringify({...manifest,dataset},null,2)+'\n');
  console.log(JSON.stringify(manifest,null,2));
  console.log('Validation only. No OCR/LLM calls. Gold labels are draft; no independent holdout is available.');
} else {
  const runId = `${new Date().toISOString().replace(/[:.]/gu,'-')}-${values.mode}`;
  const directory = path.join(rootReports,runId);
  await mkdir(directory,{recursive:true});
  let provenance: Record<string,unknown>;
  let outcomes: Outcome[] = [];
  if (values.mode === 'saved') {
    const saved = savedSchema.parse(JSON.parse(await readFile(path.resolve(values.input!),'utf8')));
    if (saved.dataset_hash !== datasetHash) throw new Error('SAVED_DATASET_HASH_MISMATCH');
    const savedIds = saved.outcomes.map(o=>o.case_id);
    if (new Set(savedIds).size !== savedIds.length || savedIds.some(id=>!dataset.cases.some(c=>c.id===id))) throw new Error('INVALID_SAVED_IDS');
    if (!values.ids && !values.limit) cases = cases.filter(c=>savedIds.includes(c.id));
    if (!cases.length || cases.some(c=>!savedIds.includes(c.id))) throw new Error('MISSING_SAVED_PREDICTION');
    outcomes = cases.map(c=>saved.outcomes.find(o=>o.case_id===c.id)!);
    provenance = {...saved.provenance,rescored_from:path.resolve(values.input!)};
  } else {
    const config = getConfig();
    if (!config.openaiKey || !config.model) throw new Error('OPENAI_NOT_CONFIGURED');
    let revision = 'unavailable', dirty = true;
    try {
      revision = execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
      dirty = !!execFileSync('git',['status','--porcelain'],{cwd:ROOT,encoding:'utf8'}).trim();
    } catch { /* Git metadata is optional; file hashes remain authoritative. */ }
    const files = ['apps/api/src/llm.ts','apps/api/src/ocr.ts','apps/api/src/pipeline.ts','packages/shared/src/index.ts','prompts/01-extract.md','prompts/02-risk.md','data/checklist.yaml','eval/benchmark/render.ts','package-lock.json'];
    const hashes = Object.fromEntries(await Promise.all(files.map(async file => [file,hash(await readFile(path.join(ROOT,file)))])));
    provenance = {provider:'google-vision+openai',model:config.model,git_revision:revision,git_dirty:dirty,files:hashes,started_at:new Date().toISOString()};
    console.log(`Live benchmark: ${cases.length} synthetic cases, split=${values.split}, model=${config.model}.`);
    for (const [index,item] of cases.entries()) {
      let outcome: Outcome;
      try {
        const images = await renderCase(item);
        const imageDir = path.join(directory,'images');
        await mkdir(imageDir,{recursive:true});
        await Promise.all(images.map((image,i)=>writeFile(path.join(imageDir,`${item.id}-p${i+1}.png`),image.bytes)));
        outcome = {case_id:item.id,status:'completed',result:analyzeResponseSchema.parse(await analyzeLive(images,item.all_pages_confirmed))};
      } catch (error) {
        // Do not persist provider headers, keys, stack traces, or arbitrary error text.
        outcome = {case_id:item.id,status:'failed',error_code:error instanceof AppError ? error.code : 'BENCHMARK_CASE_FAILED'};
      }
      outcomes.push(outcome);
      // Checkpoint each case. An interrupted run can be rescored, but never counts as full coverage.
      await writeFile(path.join(directory,'predictions.json'),JSON.stringify({dataset_hash:datasetHash,provenance,outcomes},null,2)+'\n');
      const score = scoreCase(item,outcome);
      console.log(`[${index+1}/${cases.length}] ${item.id}: ${outcome.status}; TP=${score.tp} FP=${score.fp} FN=${score.fn}`);
    }
  }
  const scores = cases.map(c=>scoreCase(c,outcomes.find(o=>o.case_id===c.id)!));
  const totals = summarize(scores);
  const fullSplit = cases.length === splitCases.length;
  const atLeast = (value: number | null, target: number) => value !== null && value >= target;
  const gates = {
    full_split:fullSplit, all_cases_completed:totals.failed===0,
    precision_85:atLeast(totals.precision,0.85), high_recall_90:atLeast(totals.high_recall,0.90),
    supported_precision_85:atLeast(totals.supported_precision,0.85),
    evidence_grounding_100:totals.evidence_total>0 && totals.evidence_grounded===totals.evidence_total,
    no_unsupported_missing:totals.unsupported_missing===0,
    clean_false_alarm_at_most_10:totals.clean_false_alarm_rate!==null && totals.clean_false_alarm_rate<=0.10,
  };
  const byTag = Object.fromEntries([...new Set(cases.flatMap(c=>c.tags))].sort().map(tag=>[tag,summarize(scores.filter(s=>s.tags.includes(tag)))]));
  let comparison: Record<string,unknown> | null = null;
  if (values.compare) {
    const previous = JSON.parse(await readFile(path.resolve(values.compare),'utf8'));
    const comparable = previous.dataset_hash === datasetHash && Array.isArray(previous.case_ids) && JSON.stringify([...previous.case_ids].sort()) === JSON.stringify(cases.map(c=>c.id).sort()) && previous.scorer_hash === evaluatorHash;
    comparison = comparable ? {comparable:true,previous_run:previous.run_id,delta:{tp:totals.tp-previous.totals.tp,fp:totals.fp-previous.totals.fp,fn:totals.fn-previous.totals.fn,failed:totals.failed-previous.totals.failed}} : {comparable:false,reason:'Different dataset, selected cases or scorer; do not interpret as quality improvement.'};
  }
  const report = {
    run_id:runId,created_at:new Date().toISOString(),mode:values.mode,split:values.split,
    dataset_version:dataset.version,dataset_hash:datasetHash,scorer_hash:evaluatorHash,
    case_ids:cases.map(c=>c.id),provenance,coverage:coverage(cases),totals,by_tag:byTag,gates,
    automatic_gates_passed:Object.values(gates).every(Boolean),release_ready:false,
    limitations:['Synthetic development set with related templates, not independent real-world accuracy.','Draft labels need two-person review.','Explanation correctness, usefulness, question quality and visual highlight alignment require human review.','Quote grounding is not semantic correctness.','No independent holdout or human quality sign-off in this run.'],
    comparison,cases:scores,
  };
  const review = cases.map(item=>({case_id:item.id,source:item.pages,expected:item.expected,
    status:outcomes.find(o=>o.case_id===item.id)!.status,
    flags:outcomes.flatMap(o=>o.case_id===item.id&&o.status==='completed'?o.result.flags:[]).map(flag=>({prediction:flag,
      reviewers:[],scores:{semantic_correctness:null,explanation_faithfulness:null,actionable_question:null,plain_vietnamese:null,visual_highlight_correct:null},notes:''})),
    omitted_issue_notes:'',label_disagreement_notes:'',
  }));
  await Promise.all([
    writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n'),
    writeFile(path.join(directory,'predictions.json'),JSON.stringify({dataset_hash:datasetHash,provenance,outcomes},null,2)+'\n'),
    writeFile(path.join(directory,'dataset.json'),JSON.stringify({...dataset,cases},null,2)+'\n'),
    writeFile(path.join(directory,'human-review.json'),JSON.stringify(review,null,2)+'\n'),
    writeFile(path.join(directory,'report.md'),[
      '# Warning benchmark', '',`Run: ${runId}; split: ${values.split}; cases: ${cases.length}/${splitCases.length}.`,
      '**Synthetic development data; draft labels. Not a release approval.**','',
      '| Metric | Result |','| --- | --- |',
      `| Completed / failed | ${totals.completed} / ${totals.failed} |`,
      `| TP / FP / FN | ${totals.tp} / ${totals.fp} / ${totals.fn} |`,
      `| Precision / recall / F1 | ${percent(totals.precision)} / ${percent(totals.recall)} / ${percent(totals.f1)} |`,
      `| High-severity recall | ${totals.high_found}/${totals.high_expected} (${percent(totals.high_recall)}) |`,
      `| Supported precision | ${percent(totals.supported_precision)} |`,
      `| Grounded citations | ${totals.evidence_grounded}/${totals.evidence_total} |`,
      `| Clean cases with false alarms | ${totals.clean_false_alarm_cases}/${totals.completed_clean_cases} |`,
      `| Exact cases | ${totals.exact_cases}/${totals.cases} |`,
      `| Input / output tokens (completed cases only) | ${totals.input_tokens} / ${totals.output_tokens} |`,
      '', '| Case | Status | TP | FP | FN |','| --- | --- | ---: | ---: | ---: |',
      ...scores.map(s=>`| ${s.id} | ${s.status} | ${s.tp} | ${s.fp} | ${s.fn} |`),
      '', 'See report.json for gates, per-rule/per-tag scores and missed/extra flags. See human-review.json and HUMAN_REVIEW.md for manual scoring.',
      'Failed cases remain in recall/exact-case denominators. Failed-call tokens may be unreported by the pipeline.',
    ].join('\n')+'\n'),
  ]);
  console.log(JSON.stringify({report:path.relative(ROOT,path.join(directory,'report.json')),totals,gates},null,2));
  if (totals.failed) process.exitCode=2;
  else if (!report.automatic_gates_passed) process.exitCode=1;
}
