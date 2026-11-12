import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadEnvironmentFiles } from './config.ts';

test('loads the configured env file while preserving shell values and skipping blanks',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'rental-config-'));
  try {
    const env=path.join(directory,'env');
    await writeFile(env,'OPENAI_API_KEY=test-file-key\nOPENAI_MODEL=file-model\nGOOGLE_CLOUD_VISION_API_KEY=\n');
    const values:Record<string,string|undefined>={};
    loadEnvironmentFiles([env],values);
    assert.equal(values.OPENAI_API_KEY,'test-file-key');
    assert.equal(values.OPENAI_MODEL,'file-model');
    assert.equal(values.GOOGLE_CLOUD_VISION_API_KEY,undefined);
    const shell={OPENAI_API_KEY:'test-shell-key'};
    loadEnvironmentFiles([env],shell);
    assert.equal(shell.OPENAI_API_KEY,'test-shell-key');
    assert.doesNotThrow(()=>loadEnvironmentFiles([path.join(directory,'missing.env')],values));
  } finally {
    await rm(path.join(directory,'env'),{force:true});
    await rmdir(directory);
  }
});
