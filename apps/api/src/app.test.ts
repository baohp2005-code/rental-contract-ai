import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeResponseSchema } from '@rental/shared';
import { createApp } from './app.ts';
import { visionPageToLines } from './ocr.ts';

test('HTTP replay returns explicit source, valid evidence, and a renderable PNG',async()=>{
  const app=createApp('replay');
  const response=await app.request('/demo/hd01',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({all_pages_confirmed:true})});
  assert.equal(response.status,200);
  const body=analyzeResponseSchema.parse(await response.json());
  assert.equal(body.mode,'replay');assert.equal(body.flags.length,4);
  assert.equal(body.metadata.model,'authored-replay');
  const image=await app.request('/samples/hd01.png');
  assert.equal(image.headers.get('Content-Type'),'image/png');
  assert.ok((await image.arrayBuffer()).byteLength>1000);
});
test('never silently substitutes fixtures for uploaded images',async()=>{
  const response=await createApp('replay').request('/analyze',{method:'POST'});
  assert.equal(response.status,503);
  assert.equal((await response.json()).error.code,'LIVE_DISABLED');
});
test('bad JSON, invalid sample and incomplete contract are handled explicitly',async()=>{
  const app=createApp('replay');
  const malformed=await app.request('/demo/hd01',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});
  assert.equal(malformed.status,400);
  const unknown=await app.request('/demo/not-a-sample',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({all_pages_confirmed:true})});
  assert.equal(unknown.status,400);
  const incomplete=await app.request('/demo/hd03',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({all_pages_confirmed:false})});
  const body=analyzeResponseSchema.parse(await incomplete.json());
  assert.ok(body.flags.filter(f=>f.type==='missing').every(f=>f.evidence_status==='needs_review'));
});
test('live upload validates images before any provider call',async()=>{
  const app=createApp('live');
  const empty=new FormData();empty.set('all_pages_confirmed','true');
  assert.equal((await app.request('/analyze',{method:'POST',body:empty})).status,400);
  const invalid=new FormData();invalid.set('all_pages_confirmed','true');invalid.append('pages',new Blob(['not an image']), 'fake.png');
  assert.equal((await app.request('/analyze',{method:'POST',body:invalid})).status,422);
});
test('HTTP message keeps user edits and omits discarded warnings',async()=>{
  const response=await createApp('replay').request('/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:'em-anh-chi',tone:'gentle',reviewed_flags:[{id:'a',keep:true,question:'Câu mới?'},{id:'b',keep:false,question:'BỎ'}]})});
  assert.equal(response.status,200);
  const body=await response.json();assert.deepEqual(body.questions,['Câu mới?']);assert.equal(body.source,'template');
});
test('Google OCR parser joins words, respects line breaks and scales coordinates',()=>{
  const page=visionPageToLines({blocks:[{paragraphs:[{words:[
    {symbols:[{text:'Tiền',property:{detectedBreak:{type:'SPACE'}}}],boundingBox:{vertices:[{x:10,y:20},{x:40,y:20},{x:40,y:40},{x:10,y:40}]}},
    {symbols:[{text:'thuê',property:{detectedBreak:{type:'LINE_BREAK'}}}],boundingBox:{vertices:[{x:50,y:20},{x:90,y:20},{x:90,y:40},{x:50,y:40}]}},
  ]}]}]},'p1',100,200);
  assert.equal(page.lines[0].raw_text,'Tiền thuê');
  assert.equal(page.lines[0].id,'p1-L01');
  assert.deepEqual(page.lines[0].polygon[0],{x:0.1,y:0.1});
  assert.deepEqual(page.lines[0].polygon[2],{x:0.9,y:0.2});
});
