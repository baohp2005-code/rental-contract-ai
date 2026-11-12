import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBenchmarkApp } from './app.ts';
import { validateAnalysis } from '@rental/shared';

const run='2026-11-10T00-00-00-000Z-live';
async function fixture(t:{after:(callback:()=>Promise<void>)=>void}) {
  const temp=await mkdtemp(path.join(tmpdir(),'benchmark-ui-test-'));
  t.after(async()=>{
    if(path.dirname(path.resolve(temp))!==path.resolve(tmpdir())||!path.basename(temp).startsWith('benchmark-ui-test-'))throw new Error('Unexpected temporary test directory');
    await rm(temp,{recursive:true,force:true});
  });
  const reports=path.join(temp,'reports'),dir=path.join(reports,run);
  await mkdir(dir,{recursive:true});
  const sample=JSON.parse(await readFile(new URL('../../data/samples/generated/hd01.replay.json',import.meta.url),'utf8'));
  const result={analysis_id:'fixture',mode:'live',sample_id:null,pages:sample.pages,...validateAnalysis(sample.pages,sample.extraction,[sample.risk.flags[0]],true),metadata:{model:'test',prompt_version:'test-v3',checklist_version:'test',elapsed_ms:10,input_tokens:10,output_tokens:5}};
  const item={id:'fixture',family:'fixture',split:'dev',source:'synthetic',title:'Test contract',tags:['positive'],review_status:'draft',reviewers:[],all_pages_confirmed:true,pages:[['Test contract']],expected:[],notes:''};
  const report={run_id:run,dataset_hash:'test-hash',dataset_version:'v1',created_at:'2026-11-10T00:00:00Z',mode:'live',totals:{cases:1,tp:1,fp:0,fn:0},cases:[{id:'fixture',tp:1,fp:0,fn:0}],provenance:{model:'test'}};
  await Promise.all([
    writeFile(path.join(dir,'report.json'),JSON.stringify(report)),
    writeFile(path.join(dir,'dataset.json'),JSON.stringify({version:'v1',description:'test',cases:[item]})),
    writeFile(path.join(dir,'predictions.json'),JSON.stringify({outcomes:[{case_id:'fixture',status:'completed',result}]})),
  ]);
  return {app:createBenchmarkApp({reports,reviews:path.join(temp,'reviews')}),report,dir};
}
const draft=()=>({reviewer:'Reviewer A',revision:0,cases:{fixture:{status:'draft',flags:{},label_decision:'pending',label_notes:'',omitted_issue_notes:'Test note'}}});
const put=(app:ReturnType<typeof createBenchmarkApp>,value:unknown,headers:Record<string,string>={})=>app.request(`/api/runs/${run}/reviews`,{method:'PUT',headers:{'Content-Type':'application/json','x-benchmark-review':'1',...headers},body:JSON.stringify(value)});

test('review UI exposes completed runs and case evidence without calling providers',async t=>{
  const {app}=await fixture(t);
  const runs=await (await app.request('/api/runs')).json();assert.equal(runs.runs.length,1);assert.equal(runs.runs[0].id,run);
  const bundle=await (await app.request(`/api/runs/${run}`)).json();assert.equal(bundle.cases[0].result.flags.length,1);
  assert.equal((await app.request('/')).status,200);
  assert.equal((await app.request('/api/runs/not-a-run')).status,400);
  assert.equal((await app.request(`/api/runs/${run}/images/not-a-case/1`)).status,404);
});
test('review drafts persist per reviewer and do not mutate report or labels',async t=>{
  const {app,dir,report}=await fixture(t);
  const saved=await put(app,draft());assert.equal(saved.status,200);assert.equal((await saved.json()).revision,1);
  const loaded=await (await app.request(`/api/runs/${run}/reviews?reviewer=Reviewer%20A`)).json();assert.equal(loaded.cases.fixture.omitted_issue_notes,'Test note');
  const separate=await (await app.request(`/api/runs/${run}/reviews?reviewer=Reviewer%20B`)).json();assert.equal(separate.revision,0);assert.deepEqual(separate.cases,{});
  assert.deepEqual(JSON.parse(await readFile(path.join(dir,'report.json'),'utf8')),report);
  const bad={...draft(),revision:1,cases:{unknown:draft().cases.fixture}};assert.equal((await put(app,bad)).status,400);
});
test('concurrent stale saves cannot overwrite another review revision',async t=>{
  const {app}=await fixture(t);
  const responses=await Promise.all([put(app,draft()),put(app,draft())]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
});
test('completion requires every rating and a label decision; local writes reject foreign origins',async t=>{
  const {app}=await fixture(t);
  const incomplete=draft();incomplete.cases.fixture.status='done';assert.equal((await put(app,incomplete)).status,400);
  const complete={...draft(),cases:{fixture:{...draft().cases.fixture,status:'done',label_decision:'agree',flags:{F1:{semantic_correctness:2,explanation_faithfulness:2,actionable_question:2,plain_vietnamese:2,visual_highlight_correct:null,notes:''}}}}};
  assert.equal((await put(app,complete,{'Origin':'https://example.com'})).status,403);
  assert.equal((await put(app,complete,{'x-benchmark-review':''})).status,403);
  assert.equal((await put(app,complete)).status,200);
});
