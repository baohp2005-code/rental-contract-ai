import { serve } from '@hono/node-server';
import { createBenchmarkApp } from './app.ts';
const port=Number(process.env.BENCHMARK_UI_PORT??8790);
serve({fetch:createBenchmarkApp().fetch,hostname:'127.0.0.1',port},()=>console.log(`Benchmark Studio: http://127.0.0.1:${port}\nĐọc kết quả có sẵn; không gọi OCR hoặc AI. Phiếu duyệt lưu ở eval/reviews/.`));
