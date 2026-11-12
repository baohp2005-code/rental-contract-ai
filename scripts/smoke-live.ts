import { getConfig } from '../apps/api/src/config.ts';
import { GoogleAuth } from 'google-auth-library';
import OpenAI from 'openai';

const config=getConfig();
let failed=false;
if (!config.openaiKey) { console.log('OpenAI: missing OPENAI_API_KEY.');failed=true; }
if (!config.model) { console.log('OpenAI: set OPENAI_MODEL to a model supporting image input and Structured Outputs.');failed=true; }
if (config.openaiKey && config.model) {
  try {
    const client = new OpenAI({apiKey:config.openaiKey,timeout:20000,maxRetries:0});
    const model = await client.models.retrieve(config.model);
    console.log(`OpenAI: model ${model.id} is accessible; image/schema support still requires a live image request.`);
  } catch (error) {
    console.log(error instanceof OpenAI.APIError ? `OpenAI: HTTP ${error.status ?? 'unknown'}; check credentials/model/access.` : 'OpenAI: connection failed or timeout.');failed=true;
  }
}
if (config.googleKey) console.log('Google OCR: API key is present, validity must be verified by a live image request.');
else {
  try {
    const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-vision']});
    await auth.getAccessToken();console.log('Google ADC: token obtained; OCR permission still requires a live image request.');
  } catch {console.log('Google OCR: no working Application Default Credentials.');failed=true;}
}
console.log('No contract content or secret values were logged. Run npm run eval -- --live only after both providers are configured.');
if (failed) process.exitCode=1;
