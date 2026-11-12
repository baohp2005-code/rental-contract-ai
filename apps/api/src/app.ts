import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { composeMessage, messageRequestSchema } from '@rental/shared';
import { ROOT, getConfig } from './config.ts';
import { AppError } from './errors.ts';
import { analyzeLive, analyzeReplay, loadReplay, SAMPLE_IDS } from './pipeline.ts';

export function createApp(mode = getConfig().mode) {
  const app = new Hono();
  let active = 0;
  app.use('*', cors({ origin:origin => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(origin) || (process.env.ALLOWED_ORIGINS ?? '').split(',').includes(origin) ? origin : '', allowMethods:['GET','POST','OPTIONS'] }));
  app.use('*', bodyLimit({maxSize:16*1024*1024,onError:c => c.json({error:{code:'BODY_TOO_LARGE',message:'Tổng dung lượng yêu cầu tối đa 16 MB.'}},413)}));
  app.onError((error, c) => {
    if (error instanceof AppError) return c.json({error:{code:error.code,message:error.publicMessage}},error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({error:{code:'INVALID_INPUT',message:'Dữ liệu gửi lên chưa đúng định dạng.'}},400);
    // Không log lỗi SDK thô vì có thể chứa nội dung hợp đồng/headers.
    return c.json({error:{code:'INTERNAL_ERROR',message:'Không xử lý được yêu cầu. Kiểm tra cấu hình hoặc thử lại.'}},500);
  });
  app.get('/health', c => {
    const config = getConfig();
    return c.json({status:'ok',mode,model:config.model || null,credentials_present:{openai:!!config.openaiKey,google:!!config.googleKey || !!process.env.GOOGLE_APPLICATION_CREDENTIALS},note:'Thông tin hiện diện cấu hình, chưa xác nhận credentials hợp lệ.'});
  });
  app.get('/samples', async c => c.json({samples:await Promise.all(SAMPLE_IDS.map(async id => { const s = await loadReplay(id); return {id,title:s.title,source:s.source,image_url:`/samples/${id}.png`}; }))}));
  app.get('/samples/:file', async c => {
    const file = c.req.param('file');
    if (!SAMPLE_IDS.some(id => file === `${id}.png`)) throw new AppError('SAMPLE_NOT_FOUND','Không có ảnh mẫu này.',400);
    try { return c.body(new Uint8Array(await readFile(path.join(ROOT,'data/samples/generated',file))),200,{'Content-Type':'image/png','Cache-Control':'no-store'}); }
    catch { throw new AppError('SAMPLE_NOT_GENERATED','Chạy npm run samples:generate.',503); }
  });
  app.post('/demo/:id', async c => {
    if (mode !== 'replay') throw new AppError('WRONG_MODE','API đang chạy live; dùng /analyze với ảnh thật.',400);
    const body = z.object({all_pages_confirmed:z.boolean()}).parse(await c.req.json());
    return c.json(await analyzeReplay(c.req.param('id'),body.all_pages_confirmed));
  });
  app.post('/analyze', async c => {
    if (mode !== 'live') throw new AppError('LIVE_DISABLED','Đang ở chế độ dữ liệu mẫu. Cấu hình PROVIDER_MODE=live để phân tích ảnh tải lên.',503);
    if (active >= 2) throw new AppError('BUSY','Đang có nhiều yêu cầu; hãy thử lại sau.',429);
    active++;
    try {
      let form: FormData;
      try { form = await c.req.formData(); }
      catch { throw new AppError('INVALID_FORM','Gửi ảnh bằng multipart/form-data.',400); }
      const files = form.getAll('pages');
      const confirmed = form.get('all_pages_confirmed');
      if (confirmed !== 'true' && confirmed !== 'false') throw new AppError('INVALID_CONFIRMATION','Cần xác nhận ảnh đã bao gồm đủ trang hay chưa.',400);
      if (files.length < 1 || files.length > 3 || files.some(file => !(file instanceof File))) throw new AppError('INVALID_PAGES','Chọn từ 1 đến 3 ảnh JPEG/PNG.',400);
      const images = [];
      for (const file of files as File[]) {
        if (file.size > 5*1024*1024 || file.size === 0) throw new AppError('INVALID_IMAGE_SIZE','Mỗi ảnh phải lớn hơn 0 và tối đa 5 MB.',413);
        try {
          const input = sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:25_000_000});
          const meta = await input.metadata();
          if (!['jpeg','png'].includes(meta.format ?? '')) throw new Error('FORMAT');
          const { data, info } = await input.rotate().resize({width:1600,height:2400,fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
          images.push({bytes:data,width:info.width,height:info.height});
        } catch { throw new AppError('INVALID_IMAGE','Ảnh không đọc được; hãy dùng JPEG/PNG dưới 25 megapixel.',422); }
      }
      return c.json(await analyzeLive(images,confirmed === 'true'));
    } finally { active--; }
  });
  app.post('/message', async c => c.json(composeMessage(messageRequestSchema.parse(await c.req.json()))));
  return app;
}
