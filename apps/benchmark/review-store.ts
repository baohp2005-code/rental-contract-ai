import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const rating = z.union([z.literal(0), z.literal(1), z.literal(2), z.null()]);
export const flagReviewSchema = z.object({
  semantic_correctness:rating, explanation_faithfulness:rating,
  actionable_question:rating, plain_vietnamese:rating,
  visual_highlight_correct:z.boolean().nullable(), notes:z.string().max(5000),
}).strict();
export const caseReviewSchema = z.object({
  status:z.enum(['draft','done']), flags:z.record(z.string(),flagReviewSchema),
  label_decision:z.enum(['pending','agree','change']), label_notes:z.string().max(10000),
  omitted_issue_notes:z.string().max(10000),
}).strict();
export const saveSchema = z.object({
  reviewer:z.string().trim().min(1).max(60), revision:z.number().int().min(0),
  cases:z.record(z.string(),caseReviewSchema),
}).strict();
const storedSchema = saveSchema.extend({run_id:z.string(),updated_at:z.string().nullable(),dataset_hash:z.string()});
export type ReviewDocument = z.infer<typeof storedSchema>;
export class ReviewError extends Error {
  constructor(public status:400|403|404|409, message:string) { super(message); }
}

export function createReviewStore(directory:string) {
  const queues = new Map<string,Promise<unknown>>();
  const filename = (run:string, reviewer:string) => path.join(directory,run,`${createHash('sha256').update(reviewer.normalize('NFC')).digest('hex')}.json`);
  async function load(run:string,reviewer:string,datasetHash:string):Promise<ReviewDocument> {
    try {
      const document=storedSchema.parse(JSON.parse(await readFile(filename(run,reviewer),'utf8')));
      if(document.dataset_hash!==datasetHash) throw new ReviewError(409,'Dữ liệu của lượt chạy đã thay đổi. Hãy chọn lượt chạy khác để duyệt.');
      return document;
    } catch(error) {
      if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;
      return {run_id:run,reviewer,revision:0,cases:{},dataset_hash:datasetHash,updated_at:null};
    }
  }
  async function save(run:string,input:z.infer<typeof saveSchema>,datasetHash:string) {
    const key=filename(run,input.reviewer);
    const previous=queues.get(key)??Promise.resolve();
    const work=previous.catch(()=>{}).then(async()=>{
      const current=await load(run,input.reviewer,datasetHash);
      if(current.revision!==input.revision) throw new ReviewError(409,'Có phiên khác vừa lưu. Hãy xuất bản nháp hiện tại rồi tải lại trang để tránh ghi đè.');
      const document:ReviewDocument={...input,run_id:run,dataset_hash:datasetHash,revision:current.revision+1,updated_at:new Date().toISOString()};
      await mkdir(path.dirname(key),{recursive:true});
      const temp=path.join(path.dirname(key),`${randomUUID()}.tmp`);
      await writeFile(temp,JSON.stringify(document,null,2)+'\n','utf8');
      await rename(temp,key);
      return document;
    });
    queues.set(key,work);
    try{return await work;}finally{if(queues.get(key)===work)queues.delete(key);}
  }
  return {load,save};
}
