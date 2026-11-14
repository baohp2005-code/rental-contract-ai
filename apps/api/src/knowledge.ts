/**
 * Đọc bộ kiến thức (data/*.yaml) và prompt (prompts/*.md) lúc khởi động.
 *
 * Prompt nằm trong khối ``` đầu tiên của mỗi file .md, để vai Prompt sửa file
 * markdown là backend dùng ngay, không phải chép sang code.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  ChecklistSchema,
  MarketNormsSchema,
  type Checklist,
  type MarketNorms,
} from '@rental/shared/src/knowledge';
import YAML from 'yaml';

export type Knowledge = {
  checklist: Checklist;
  norms: MarketNorms;
  /** Văn bản gốc của YAML, đưa nguyên vào prompt B4. */
  checklistYaml: string;
  normsYaml: string;
};

export type Prompts = {
  extract: string;
  risk: string;
  message: string;
};

export function loadKnowledge(dataDir: string): Knowledge {
  const checklistYaml = readFileSync(path.join(dataDir, 'checklist.yaml'), 'utf8');
  const normsYaml = readFileSync(path.join(dataDir, 'market_norms.yaml'), 'utf8');
  return {
    checklist: ChecklistSchema.parse(YAML.parse(checklistYaml)),
    norms: MarketNormsSchema.parse(YAML.parse(normsYaml) ?? {}),
    checklistYaml,
    normsYaml,
  };
}

/** Lấy nội dung khối ``` đầu tiên trong file markdown. */
export function firstCodeBlock(markdown: string, file = 'prompt'): string {
  const match = markdown.match(/```[^\n]*\n([\s\S]*?)\n```/);
  if (!match) throw new Error(`${file}: không tìm thấy khối \`\`\` chứa prompt`);
  return match[1].trim();
}

export function loadPrompts(promptsDir: string, knowledge: Knowledge): Prompts {
  const read = (name: string) =>
    firstCodeBlock(readFileSync(path.join(promptsDir, name), 'utf8'), name);

  // Prompt B4 có chỗ trống <checklist>…</checklist> và <market_norms>…</market_norms>.
  const risk = read('02-risk.md')
    .replace(/<checklist>[\s\S]*?<\/checklist>/, () => `<checklist>\n${knowledge.checklistYaml.trim()}\n</checklist>`)
    .replace(
      /<market_norms>[\s\S]*?<\/market_norms>/,
      () => `<market_norms>\n${knowledge.normsYaml.trim()}\n</market_norms>`,
    );

  if (!risk.includes(knowledge.checklistYaml.trim().slice(0, 40))) {
    throw new Error('02-risk.md: thiếu chỗ <checklist>…</checklist> để chèn checklist');
  }

  return {
    extract: read('01-extract.md'),
    risk,
    message: read('03-message.md'),
  };
}
