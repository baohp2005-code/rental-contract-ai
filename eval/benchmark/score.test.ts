import test from 'node:test';
import assert from 'node:assert/strict';
import { type AnalyzeResponse, type CheckedFlag, termNames, keyTermsSchema } from '@rental/shared';
import { dataset } from './data.ts';
import { validateDataset, coverage, type BenchmarkCase } from './schema.ts';
import { scoreCase, summarize } from './score.ts';

const positive = dataset.cases.find(c=>c.id==='rnt-01-positive')!;
const clean = dataset.cases.find(c=>c.id==='rnt-01-negative')!;
function result(item: BenchmarkCase, flags: CheckedFlag[] = []): AnalyzeResponse {
  const pages = item.pages.map((page, index)=>({id:`p${index+1}`,width:1600,height:1200,lines:page.map((text,i)=>({
    id:`p${index+1}-L${i+1}`,page_id:`p${index+1}`,raw_text:text,
    polygon:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],
  }))}));
  return {analysis_id:'test',mode:'live',sample_id:null,pages,
    extraction:{lines:pages.flatMap(p=>p.lines.map(l=>({line_id:l.id,corrected_text:l.raw_text}))),
      key_terms:keyTermsSchema.parse(Object.fromEntries(termNames.map(key=>[key,{value:null,unit:'',raw_text:'',line_ids:[],status:'not_found'}])))},
    flags,warnings:[],calculations:{deposit_months:null},metadata:{model:'test',prompt_version:'test',checklist_version:'test',elapsed_ms:10,input_tokens:1,output_tokens:1}};
}
function flag(item = positive, goldIndex = 0): CheckedFlag {
  const gold = item.expected[goldIndex], anchor = gold.evidence_any_of[0];
  const lineIndex = anchor ? item.pages[anchor.page-1].findIndex(l=>l.toLowerCase().includes(anchor.contains.toLowerCase())) : -1;
  return {id:'F1',rule_id:gold.rule_id,type:gold.type,severity:gold.severity,
    line_ids:anchor?[`p${anchor.page}-L${lineIndex+1}`]:[],quote:anchor?item.pages[anchor.page-1][lineIndex]:'',
    title:'Test',explanation:'Test',question_for_landlord:'Test?',evidence_status:anchor?'verified':'not_applicable',evidence_reason:''};
}
const score = (item: BenchmarkCase, flags: CheckedFlag[]) => scoreCase(item,{case_id:item.id,status:'completed',result:result(item,flags)});

test('dataset covers 24 cases, every MVP rule, targeted negatives; no pretend holdout',()=>{
  const report=coverage(dataset.cases);
  assert.equal(report.cases,24);
  assert.equal(report.reviewed_cases,0);
  assert.ok(Object.values(report.by_rule).every(r=>r.positive_cases>0&&r.targeted_negative_cases>0));
  assert.equal(dataset.cases.filter(c=>c.split==='holdout').length,0);
  assert.equal(new Set(dataset.cases.map(c=>JSON.stringify(c.pages))).size,24);
});
test('correct flag receives TP, supported TP and exact match',()=>{
  const s=score(positive,[flag()]); assert.equal(s.tp,1);assert.equal(s.supported_tp,1);assert.equal(s.exact,true);
});
test('duplicate prediction is FP, never a second TP',()=>{
  const s=score(positive,[flag(),{...flag(),id:'F2'}]);assert.equal(s.tp,1);assert.equal(s.fp,1);assert.equal(s.fn,0);
});
test('matching rule on unrelated line is FP and FN',()=>{
  const s=score(positive,[{...flag(),line_ids:['p1-L3'],quote:positive.pages[0][2]}]);assert.equal(s.tp,0);assert.equal(s.fp,1);assert.equal(s.fn,1);
});
test('wrong type is FP and FN even with correct rule and source',()=>{
  const s=score(positive,[{...flag(),type:'unclear'}]);assert.equal(s.tp,0);assert.equal(s.fp,1);assert.equal(s.fn,1);
});
test('unsupported quote does not gain supported precision from provider verified status',()=>{
  const s=score(positive,[{...flag(),quote:'Câu bịa không có trong tài liệu',evidence_status:'verified'}]);
  assert.equal(s.tp,1);assert.equal(s.supported_tp,0);assert.equal(s.evidence_grounded,0);assert.equal(s.exact,false);
});
test('nonexistent line cannot match clause',()=>{
  assert.equal(score(positive,[{...flag(),line_ids:['p1-unknown']}]).tp,0);
});
test('wrong severity measured separately and fails exact-case metric',()=>{
  const s=score(positive,[{...flag(),severity:'low'}]);assert.equal(s.tp,1);assert.equal(s.severity_correct,0);assert.equal(s.exact,false);
});
test('failed provider case stays in recall denominator; clean failure is not a success',()=>{
  const totals=summarize([score(positive,[flag()]),scoreCase({...positive,id:'failed'},{case_id:'failed',status:'failed',error_code:'OCR_UNAVAILABLE'}),scoreCase(clean,{case_id:clean.id,status:'failed',error_code:'OCR_UNAVAILABLE'})]);
  assert.equal(totals.failed,2);assert.equal(totals.recall,0.5);assert.equal(totals.clean_success_rate,0);assert.equal(totals.clean_false_alarm_rate,null);
});
test('no predictions: precision N/A, recall zero for positive case',()=>{
  const totals=summarize([score(positive,[])]);assert.equal(totals.precision,null);assert.equal(totals.recall,0);assert.equal(totals.f1,0);
});
test('clean case false alarm is measured explicitly',()=>{
  const totals=summarize([score(clean,[flag()])]);assert.equal(totals.fp,1);assert.equal(totals.clean_false_alarm_rate,1);
});
test('incomplete input missing prediction is unsupported and false positive',()=>{
  const item=dataset.cases.find(c=>c.id==='incomplete-no-missing')!;
  const s=score(item,[{...flag(),rule_id:'DEP-01',type:'missing',line_ids:[],quote:''}]);assert.equal(s.unsupported_missing,1);assert.equal(s.fp,1);
});
test('one broad flag cannot satisfy two expected issues; maximum matching handles overlapping candidates',()=>{
  const item=structuredClone(positive);
  const extraText='Điều bổ sung: chủ nhà được tăng tiền thuê phòng phụ mỗi tuần không báo trước.';
  item.pages[0].push(extraText);
  item.expected.push({...item.expected[0],id:'second',evidence_any_of:[{page:1,contains:extraText}]});
  const broad={...flag(),id:'broad',line_ids:[...flag().line_ids,`p1-L${item.pages[0].length}`],quote:flag().quote+' '+extraText};
  assert.equal(score(item,[broad]).tp,1);assert.equal(score(item,[broad]).fn,1);
  assert.equal(score(item,[broad,flag()]).tp,2);
});
test('correct anchor on wrong page cannot match',()=>{
  const item=structuredClone(positive);item.pages.push([...item.pages[0]]);item.expected[0].evidence_any_of[0].page=2;
  assert.equal(score(item,[flag()]).tp,0);
});
test('dataset rejects split leakage even if holdout labels reviewed',()=>{
  const input=structuredClone(dataset);input.cases[0].split='holdout';input.cases[0].review_status='reviewed';input.cases[0].reviewers=['one','two'];
  assert.throws(()=>validateDataset(input),/SPLIT_LEAKAGE/);
});
test('dataset rejects missing source evidence and false missing labels on incomplete pages',()=>{
  const input=structuredClone(dataset);input.cases.find(c=>c.id===positive.id)!.expected[0].evidence_any_of[0].contains='invented anchor';
  assert.throws(()=>validateDataset(input),/GOLD_EVIDENCE_NOT_IN_SOURCE/);
  const missing=structuredClone(dataset);missing.cases[0].all_pages_confirmed=false;
  assert.throws(()=>validateDataset(missing),/INVALID_MISSING_LABEL/);
});
