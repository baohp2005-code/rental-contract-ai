import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const ENV_FILE = fileURLToPath(new URL('./.env', import.meta.url));
// Shell variables take priority; the project's config file is apps/api/src/.env.
export function loadEnvironmentFiles(files: string[], target: Record<string, string | undefined> = process.env) {
  for (const file of files) {
    let content: string;
    try { content = readFileSync(file, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    for (const [key, value] of Object.entries(parse(content))) {
      if (!target[key]?.trim() && value.trim()) target[key] = value;
    }
  }
}
loadEnvironmentFiles([ENV_FILE]);
export function getConfig() {
  const mode = process.env.PROVIDER_MODE ?? 'replay';
  if (mode !== 'replay' && mode !== 'live') throw new Error('PROVIDER_MODE phải là replay hoặc live.');
  return {
    mode, port: Number(process.env.PORT ?? 8787), host: process.env.HOST ?? '0.0.0.0',
    model: process.env.OPENAI_MODEL?.trim() ?? '',
    openaiKey: process.env.OPENAI_API_KEY?.trim() ?? '',
    googleKey: process.env.GOOGLE_CLOUD_VISION_API_KEY ?? '',
  } as const;
}
