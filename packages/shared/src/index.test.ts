import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeResponseSchema, composeMessage, messageRequestSchema, parseNumericTerm, validateAnalysis } from './index.ts';

async function fixture(id='hd01') {
  return JSON.parse(await readFile(new URL(`../../../data/samples/generated/${id}.replay.json`,import.meta.url),'utf8'));
}
test('normalizes Vietnamese money without accepting a model-invented magnitude',()=>{
  for (const [text,value] of [['3tr5',3500000],['3k8/số',3800],['3.500.000 đồng',3500000],['3,5 triệu',3500000],['30 ngày',30]] as const) assert.equal(parseNumericTerm(text),value);
  assert.equal(parseNumericTerm('-3500000'),null);
});
test('authored sample passes evidence checks and deposit ratio is calculated by code',async()=>{
  const sample=await fixture();
  const result=validateAnalysis(sample.pages,sample.extraction,sample.risk.flags,true);
  assert.equal(result.calculations.deposit_months,2);
  assert.ok(result.flags.every(f=>f.evidence_status==='verified'));
});
test('rejects invented line IDs and quotes without treating negation as equivalent',async()=>{
  const s=await fixture();
  s.risk.flags[0].line_ids=['p9-L99'];
  s.risk.flags[1].quote='Chủ nhà không được tăng giá thuê';
  const result=validateAnalysis(s.pages,s.extraction,s.risk.flags,true);
  assert.equal(result.flags[0].evidence_status,'needs_review');
  assert.equal(result.flags[1].evidence_status,'needs_review');
});
test('missing flags remain unverified until full readable contract is confirmed',async()=>{
  const s=await fixture('hd03');
  const incomplete=validateAnalysis(s.pages,s.extraction,s.risk.flags,false);
  assert.ok(incomplete.flags.filter(f=>f.type==='missing').every(f=>f.evidence_status==='needs_review'));
  s.extraction.lines[0].corrected_text='[không đọc được]';
  const unreadable=validateAnalysis(s.pages,s.extraction,s.risk.flags,true);
  assert.ok(unreadable.flags.filter(f=>f.type==='missing').every(f=>f.evidence_status==='needs_review'));
});
test('invalid numeric extraction cannot influence calculations',async()=>{
  const s=await fixture();
  s.extraction.key_terms.deposit_vnd.value=70000000;
  const result=validateAnalysis(s.pages,s.extraction,s.risk.flags,true);
  assert.equal(result.extraction.key_terms.deposit_vnd.status,'unclear');
  assert.equal(result.extraction.key_terms.deposit_vnd.value,null);
  assert.equal(result.calculations.deposit_months,null);
});
test('numeric OCR correction is visible as uncertainty, not trusted as a source',async()=>{
  const s=await fixture();
  s.extraction.lines[2].corrected_text=s.extraction.lines[2].corrected_text.replace('7.000.000','70.000.000');
  s.extraction.key_terms.deposit_vnd.raw_text='70.000.000';
  s.extraction.key_terms.deposit_vnd.value=70000000;
  const result=validateAnalysis(s.pages,s.extraction,s.risk.flags,true);
  assert.equal(result.calculations.deposit_months,null);
  assert.equal(result.flags[0].evidence_status,'needs_review');
});
test('does not accept added or deleted OCR lines',async()=>{
  const s=await fixture();s.extraction.lines.pop();
  assert.throws(()=>validateAnalysis(s.pages,s.extraction,[],true),/EXTRACTION_LINE_MISMATCH/u);
});
test('no warnings means no invented flags on the low-risk sample',async()=>{
  const s=await fixture('hd02');
  assert.equal(validateAnalysis(s.pages,s.extraction,s.risk.flags,true).flags.length,0);
});
test('message uses only kept, edited questions in their given order',()=>{
  const result=composeMessage({reviewed_flags:[{id:'F1',keep:false,question:'KHÔNG ĐƯỢC GỬI'},{id:'F2',keep:true,question:'Câu em đã sửa?'}],address:'em-anh-chi',tone:'gentle'});
  assert.deepEqual(result.questions,['Câu em đã sửa?']);
  assert.ok(!result.message.includes('KHÔNG ĐƯỢC GỬI'));
  assert.ok(result.message.includes('Câu em đã sửa?'));
  assert.equal(composeMessage({reviewed_flags:[],address:'em-anh-chi',tone:'direct'}).message,'');
  assert.equal(messageRequestSchema.safeParse({reviewed_flags:[{id:'x',keep:true,question:' '}],address:'em-anh-chi',tone:'direct'}).success,false);
});
