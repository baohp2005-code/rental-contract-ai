import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { analyzeResponseSchema } from '@rental/shared';
import { datasetSchema } from '../../eval/benchmark/schema.ts';
import { createReviewStore, ReviewError, saveSchema } from './review-store.ts';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const runIdSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}T[\d-]+Z-(live|saved)$/u);
const reportSchema=z.object({
  run_id:z.string(),dataset_hash:z.string(),dataset_version:z.string(),created_at:z.string(),mode:z.string(),
  totals:z.record(z.string(),z.unknown()),cases:z.array(z.object({id:z.string()}).passthrough()),
  provenance:z.object({model:z.string().optional()}).passthrough(),
}).passthrough();
const predictionSchema=z.object({outcomes:z.array(z.discriminatedUnion('status',[
  z.object({case_id:z.string(),status:z.literal('completed'),result:analyzeResponseSchema}),
  z.object({case_id:z.string(),status:z.literal('failed'),error_code:z.string()}),
]))});

export function createBenchmarkApp(options:{reports?:string;reviews?:string}={}) {
  const reports=options.reports??path.join(ROOT,'eval/reports/benchmark');
  const store=createReviewStore(options.reviews??path.join(ROOT,'eval/reviews'));
  const app=new Hono();
  app.use('*',bodyLimit({maxSize:1024*1024,onError:c=>c.json({error:'Phiếu duyệt quá lớn.'},413)}));
  app.use('*',async(c,next)=>{
    const url=new URL(c.req.url);
    if(!['localhost','127.0.0.1'].includes(url.hostname)) return c.json({error:'Màn hình này chỉ dùng trên máy cục bộ.'},403);
    const origin=c.req.header('origin');
    if(origin&&origin!==url.origin) return c.json({error:'Nguồn yêu cầu không hợp lệ.'},403);
    if(c.req.method==='PUT'&&c.req.header('x-benchmark-review')!=='1') return c.json({error:'Thiếu thông tin phiên duyệt.'},403);
    c.header('Cache-Control','no-store');
    c.header('X-Content-Type-Options','nosniff');
    c.header('Referrer-Policy','no-referrer');
    c.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    await next();
  });
  app.onError((error,c)=>{
    if(error instanceof ReviewError)return c.json({error:error.message},error.status);
    if(error instanceof z.ZodError||error instanceof SyntaxError)return c.json({error:'Dữ liệu không hợp lệ. Kiểm tra lại phiếu duyệt.'},400);
    if((error as NodeJS.ErrnoException).code==='ENOENT')return c.json({error:'Không tìm thấy dữ liệu của lượt chạy này.'},404);
    return c.json({error:'Không đọc hoặc lưu được dữ liệu. Hãy thử lại.'},500);
  });
  async function runDir(id:string) {
    runIdSchema.parse(id);
    const base=await realpath(reports),resolved=await realpath(path.join(base,id));
    if(path.dirname(resolved)!==base)throw new ReviewError(403,'Đường dẫn không hợp lệ.');
    return resolved;
  }
  async function bundle(id:string) {
    const dir=await runDir(id);
    const [report,dataset,predictions]=await Promise.all([
      readFile(path.join(dir,'report.json'),'utf8').then(s=>reportSchema.parse(JSON.parse(s))),
      readFile(path.join(dir,'dataset.json'),'utf8').then(s=>datasetSchema.parse(JSON.parse(s))),
      readFile(path.join(dir,'predictions.json'),'utf8').then(s=>predictionSchema.parse(JSON.parse(s))),
    ]);
    return {report,dataset,predictions,dir};
  }
  app.get('/api/runs',async c=>{
    let entries;
    try{entries=await readdir(reports,{withFileTypes:true});}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return c.json({runs:[]});throw error;}
    const runs=[];
    for(const entry of entries) {
      if(!entry.isDirectory()||!runIdSchema.safeParse(entry.name).success)continue;
      try {
        const {report,predictions}=await bundle(entry.name);
        const first=predictions.outcomes.find(o=>o.status==='completed');
        runs.push({id:entry.name,created_at:report.created_at,mode:report.mode,model:report.provenance.model??'—',prompt_version:first?.status==='completed'?first.result.metadata.prompt_version:'—',totals:report.totals,dataset_version:report.dataset_version});
      } catch { /* Incomplete runs are not reviewable yet. */ }
    }
    return c.json({runs:runs.sort((a,b)=>b.id.localeCompare(a.id))});
  });
  app.get('/api/runs/:id',async c=>{
    const {report,dataset,predictions}=await bundle(c.req.param('id'));
    return c.json({report,cases:dataset.cases.map(item=>{
      const outcome=predictions.outcomes.find(o=>o.case_id===item.id);
      return {...item,score:report.cases.find(s=>s.id===item.id),result:outcome?.status==='completed'?outcome.result:null,error:outcome?.status==='failed'?outcome.error_code:null};
    })});
  });
  app.get('/api/runs/:id/images/:caseId/:page',async c=>{
    const {dir,dataset,report}=await bundle(c.req.param('id'));
    const item=dataset.cases.find(item=>item.id===c.req.param('caseId'));
    const page=Number(c.req.param('page'));
    if(!item||!Number.isInteger(page)||page<1||page>item.pages.length)throw new ReviewError(404,'Không có trang này.');
    let imageDir=dir;
    const rescored=report.provenance.rescored_from;
    if(report.mode==='saved'&&typeof rescored==='string') imageDir=await runDir(path.basename(path.dirname(rescored)));
    const file=await realpath(path.join(imageDir,'images',`${item.id}-p${page}.png`));
    if(path.dirname(file)!==path.join(imageDir,'images'))throw new ReviewError(403,'Ảnh không hợp lệ.');
    return c.body(new Uint8Array(await readFile(file)),200,{'Content-Type':'image/png'});
  });
  app.get('/api/runs/:id/reviews',async c=>{
    const {report}=await bundle(c.req.param('id'));
    const reviewer=saveSchema.shape.reviewer.parse(c.req.query('reviewer'));
    return c.json(await store.load(c.req.param('id'),reviewer,report.dataset_hash));
  });
  app.put('/api/runs/:id/reviews',async c=>{
    const input=saveSchema.parse(await c.req.json());
    const {report,dataset,predictions}=await bundle(c.req.param('id'));
    for(const [id,review] of Object.entries(input.cases)) {
      if(!dataset.cases.some(item=>item.id===id))throw new ReviewError(400,'Phiếu chứa ca không thuộc lượt chạy.');
      const outcome=predictions.outcomes.find(o=>o.case_id===id);
      const flags=outcome?.status==='completed'?outcome.result.flags:[];
      if(Object.keys(review.flags).some(id=>!flags.some(f=>f.id===id)))throw new ReviewError(400,'Phiếu chứa cảnh báo không tồn tại.');
      if(review.status==='done') {
        const incomplete=flags.some(f=>{const scores=review.flags[f.id];return !scores||[scores.semantic_correctness,scores.explanation_faithfulness,scores.actionable_question,scores.plain_vietnamese].some(s=>s===null);});
        if(incomplete||review.label_decision==='pending'||(review.label_decision==='change'&&!review.label_notes.trim()))throw new ReviewError(400,'Chấm đủ các cảnh báo và xác nhận nhãn kỳ vọng trước khi hoàn tất.');
      }
    }
    return c.json(await store.save(c.req.param('id'),input,report.dataset_hash));
  });
  const assets:Record<string,string>={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css'};
  for(const [route,file] of Object.entries(assets))app.get(route,async c=>c.body(await readFile(new URL(`./public/${file}`,import.meta.url),'utf8'),200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'}));
  return app;
}
