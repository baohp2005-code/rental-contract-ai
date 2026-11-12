import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig, ROOT } from '../apps/api/src/config.ts';
import { loadReplay } from '../apps/api/src/pipeline.ts';
import { runLlm } from '../apps/api/src/llm.ts';
import { AppError } from '../apps/api/src/errors.ts';
import { validateAnalysis } from '@rental/shared';

// Real OpenAI calls, but authored OCR. This explicitly does not test Google Vision.
const config=getConfig();
const modelIndex=process.argv.indexOf('--model');
const model=modelIndex>=0?process.argv[modelIndex+1]:config.model;
if (!model || !config.openaiKey) {
  console.log('Cần OPENAI_API_KEY và OPENAI_MODEL, hoặc --model MODEL_ID.');
  process.exit(1);
}
const sample=await loadReplay('hd01');
const expectedCases=JSON.parse(await readFile(path.join(ROOT,'eval/expected.json'),'utf8'));
const expected=expectedCases.find((item:{id:string})=>item.id===sample.id) as {flags:{rule_id:string;type:string}[];terms:Record<string,unknown>};
const bytes=await readFile(path.join(ROOT,'data/samples/generated/hd01.png'));
const start=performance.now();
let providerStatus:number|null=null, providerCode:string|null=null;
const diagnosticFetch:typeof fetch=async (input,init)=>{
  const response=await fetch(input,init);
  providerStatus=response.status;
  if (!response.ok) {
    const body=await response.clone().json().catch(()=>null) as {error?:{code?:string}}|null;
    const knownCodes=['insufficient_quota','invalid_api_key','model_not_found','rate_limit_exceeded','invalid_json_schema','unsupported_value'];
    providerCode=knownCodes.includes(body?.error?.code??'')?body!.error!.code!:null;
  }
  return response;
};
let report:Record<string,unknown>;
try {
  const llm=await runLlm(sample.pages,[{bytes,width:sample.pages[0].width,height:sample.pages[0].height}],config.openaiKey,model,{fetch:diagnosticFetch});
  const extraction=validateAnalysis(sample.pages,llm.extraction,[],true).extraction;
  const risk=await llm.analyzeRisk(extraction,true);
  const checked=validateAnalysis(sample.pages,llm.extraction,risk.flags,true);
  const matches=(a:{rule_id:string;type:string},b:{rule_id:string;type:string})=>a.rule_id===b.rule_id&&a.type===b.type;
  const truePositive=expected.flags.filter(e=>checked.flags.some(f=>matches(f,e))).length;
  const falseNegative=expected.flags.length-truePositive;
  const falsePositive=checked.flags.filter(f=>!expected.flags.some(e=>matches(f,e))).length;
  const termEntries=Object.entries(expected.terms);
  const termsCorrect=termEntries.filter(([key,value])=>checked.extraction.key_terms[key as keyof typeof checked.extraction.key_terms].value===value).length;
  const quality={true_positive:truePositive,false_negative:falseNegative,false_positive:falsePositive,numeric_terms_correct:termsCorrect,numeric_terms_expected:termEntries.length};
  report={status:'completed',schema_valid:true,quality_status:falsePositive||falseNegative||termsCorrect!==termEntries.length?'needs_review':'matches_development_labels',quality,mode:'openai-live-with-authored-ocr',sample_id:sample.id,model,ocr_source:'authored fixture, NOT Google OCR',elapsed_ms:Math.round(performance.now()-start),input_tokens:risk.inputTokens,output_tokens:risk.outputTokens,key_terms:checked.extraction.key_terms,flags:checked.flags,warnings:checked.warnings};
  console.log(JSON.stringify({status:report.status,quality_status:report.quality_status,quality,model,elapsed_ms:report.elapsed_ms,input_tokens:risk.inputTokens,output_tokens:risk.outputTokens,flags:checked.flags.map(f=>({rule_id:f.rule_id,evidence_status:f.evidence_status})),note:report.ocr_source},null,2));
} catch (error) {
  report={status:'failed',mode:'openai-live-with-authored-ocr',sample_id:sample.id,model,elapsed_ms:Math.round(performance.now()-start),provider_status:providerStatus,provider_code:providerCode,error_code:error instanceof AppError?error.code:'UNEXPECTED_ERROR',message:error instanceof AppError?error.publicMessage:'Không hoàn tất thử nghiệm; không ghi log lỗi thô.'};
  console.log(JSON.stringify(report,null,2));process.exitCode=1;
}
await mkdir(path.join(ROOT,'eval/reports'),{recursive:true});
await writeFile(path.join(ROOT,'eval/reports/openai-smoke.json'),JSON.stringify(report,null,2)+'\n');
