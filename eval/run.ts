import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { analyzeLive, analyzeReplay } from '../apps/api/src/pipeline.ts';
import { ROOT } from '../apps/api/src/config.ts';
import type { AnalyzeResponse } from '@rental/shared';

const live=process.argv.includes('--live');
const expected=JSON.parse(await readFile(path.join(ROOT,'eval/expected.json'),'utf8'));
const reports: Record<string,number|string>[]=[];
for (const item of expected) {
  let result:AnalyzeResponse;
  if (live) {
    const bytes=await readFile(path.join(ROOT,'data/samples/generated',`${item.id}.png`));
    const meta=await sharp(bytes).metadata();
    result=await analyzeLive([{bytes,width:meta.width!,height:meta.height!}],true);
  } else result=await analyzeReplay(item.id,true);
  const actual=result.flags;
  const match=(a:any,b:any)=>a.rule_id===b.rule_id&&a.type===b.type;
  const truePositive=item.flags.filter((e:any)=>actual.some(a=>match(a,e))).length;
  const falseNegative=item.flags.length-truePositive;
  const falsePositive=actual.filter(a=>!item.flags.some((e:any)=>match(a,e))).length;
  const expectedHigh=item.flags.filter((f:any)=>f.rule_id!=='TRM-02');
  const highFound=expectedHigh.filter((e:any)=>actual.some(a=>match(a,e))).length;
  const terms=Object.entries(item.terms);
  const termsCorrect=terms.filter(([key,value])=>result.extraction.key_terms[key as keyof typeof result.extraction.key_terms].value===value).length;
  const evidence=actual.filter(f=>f.type!=='missing');
  reports.push({id:item.id,true_positive:truePositive,false_negative:falseNegative,false_positive:falsePositive,high_found:highFound,high_expected:expectedHigh.length,terms_correct:termsCorrect,terms_expected:terms.length,evidence_verified:evidence.filter(f=>f.evidence_status==='verified').length,evidence_total:evidence.length,elapsed_ms:result.metadata.elapsed_ms,input_tokens:result.metadata.input_tokens,output_tokens:result.metadata.output_tokens});
}
const sum=(key:string)=>reports.reduce((total,r)=>total+Number(r[key]),0);
const report={mode:live?'live':'replay',note:live?'Ba mẫu mô phỏng dùng để phát triển; chưa phải tập kiểm tra độc lập.':'Kiểm tra tích hợp bằng dữ liệu soạn sẵn. Các chỉ số không đo chất lượng OCR/LLM thật.',samples:reports,totals:Object.fromEntries(['true_positive','false_negative','false_positive','high_found','high_expected','terms_correct','terms_expected','evidence_verified','evidence_total'].map(k=>[k,sum(k)]))};
await mkdir(path.join(ROOT,'eval/reports'),{recursive:true});
await writeFile(path.join(ROOT,'eval/reports',live?'live.json':'replay.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if (sum('false_negative') || sum('false_positive') || sum('terms_correct')!==sum('terms_expected')) process.exitCode=1;
