import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { getConfig } from './config.ts';

const config = getConfig();
serve({fetch:createApp().fetch,port:config.port,hostname:config.host}, () => {
  console.log(`Rental API: http://localhost:${config.port} (${config.mode})`);
  console.log('Bản thử nghiệm cục bộ, chưa có đăng nhập. Không public API này lên Internet.');
});
