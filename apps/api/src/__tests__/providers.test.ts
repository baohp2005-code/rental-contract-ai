import { zodTextFormat } from 'openai/helpers/zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLlm, pickProvider } from '../llm';
import { createOpenAiLlm } from '../llm/openai';
import { checkVisionCredentials, createVisionOcr } from '../ocr/vision';
import { ApiFailure } from '../pipeline/errors';
import { ExtractOutSchema, MessageOutSchema, RiskOutSchema } from '../pipeline/schemas';

describe('chọn nhà cung cấp LLM', () => {
  it('theo LLM_PROVIDER, hoặc tự chọn theo key có sẵn', () => {
    expect(pickProvider({ LLM_PROVIDER: 'OpenAI' })).toBe('openai');
    expect(pickProvider({ LLM_PROVIDER: 'claude', OPENAI_API_KEY: 'x' })).toBe('claude');
    expect(pickProvider({ OPENAI_API_KEY: 'x' })).toBe('openai');
    expect(pickProvider({ OPENAI_API_KEY: 'x', ANTHROPIC_API_KEY: 'y' })).toBe('claude');
    expect(pickProvider({ ANTHROPIC_API_KEY: 'y' })).toBe('claude');
    expect(pickProvider({})).toBe('none');
    expect(pickProvider({ LLM_PROVIDER: 'none', OPENAI_API_KEY: 'x' })).toBe('none');
    expect(() => pickProvider({ LLM_PROVIDER: 'gemini' })).toThrow('LLM_PROVIDER');
  });

  it('báo rõ thiếu key hoặc thiếu model', () => {
    expect(() => createLlm({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'k' })).toThrow('OPENAI_MODEL');
    expect(() => createLlm({ LLM_PROVIDER: 'openai', OPENAI_MODEL: 'm' })).toThrow('OPENAI_API_KEY');
    expect(() => createLlm({ LLM_PROVIDER: 'claude' })).toThrow('ANTHROPIC_API_KEY');
    expect(createLlm({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'k', OPENAI_MODEL: 'gpt-x' })?.label).toBe('openai:gpt-x');
    expect(createLlm({ ANTHROPIC_API_KEY: 'k' })?.label).toBe('claude:claude-opus-5-5');
    expect(createLlm({ LLM_PROVIDER: 'none' })).toBeNull();
  });

  it('3 khuôn đầu ra chuyển được sang Structured Outputs chế độ strict của OpenAI', () => {
    for (const schema of [ExtractOutSchema, RiskOutSchema, MessageOutSchema]) {
      const format = zodTextFormat(schema, 'result');
      expect(format.strict).toBe(true);
    }
  });
});

describe('OpenAI adapter', () => {
  it('gửi ảnh dạng data URL, store:false, và đọc JSON trả về', async () => {
    let sent: any;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({
          id: 'resp_1',
          object: 'response',
          status: 'completed',
          output: [
            {
              type: 'message',
              id: 'msg_1',
              role: 'assistant',
              status: 'completed',
              content: [
                {
                  type: 'output_text',
                  annotations: [],
                  text: JSON.stringify({ message: 'Em chào anh ạ.', questions: ['Hỏi 1'], suggested_clauses: [] }),
                },
              ],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const llm = createOpenAiLlm({ apiKey: 'k', model: 'gpt-x', fetch: fakeFetch });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = await llm.structured({
      step: 'B5',
      system: 'hệ thống',
      content: [
        { type: 'text', text: 'xin chào' },
        { type: 'image', mediaType: 'image/jpeg', base64: 'QUJD' },
      ],
      schema: MessageOutSchema,
      maxTokens: 100,
    });
    log.mockRestore();

    expect(out).toEqual({ message: 'Em chào anh ạ.', questions: ['Hỏi 1'], suggested_clauses: [] });
    expect(sent.model).toBe('gpt-x');
    expect(sent.store).toBe(false);
    expect(sent.instructions).toBe('hệ thống');
    expect(sent.input[0].content[1]).toEqual({
      type: 'input_image',
      image_url: 'data:image/jpeg;base64,QUJD',
      detail: 'high',
    });
    expect(sent.text.format.type).toBe('json_schema');
  });
});

describe('Google Vision qua REST', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('có API key thì gửi header x-goog-api-key và ghép dòng từ kết quả', async () => {
    let headers: Record<string, string> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        headers = init.headers as Record<string, string>;
        return new Response(
          JSON.stringify({
            responses: [
              {
                fullTextAnnotation: {
                  pages: [
                    {
                      width: 100,
                      height: 100,
                      blocks: [
                        {
                          paragraphs: [
                            {
                              words: [
                                {
                                  symbols: [
                                    { text: 'H', boundingBox: { vertices: [{ x: 10, y: 10 }, { x: 20, y: 20 }] } },
                                    { text: 'Đ', boundingBox: { vertices: [{ x: 20, y: 10 }, { x: 30, y: 20 }] } },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }),
    );
    const pages = await createVisionOcr({ GOOGLE_CLOUD_VISION_API_KEY: 'abc' }).readPages([Buffer.from('x')]);
    expect(headers['x-goog-api-key']).toBe('abc');
    expect(pages[0].lines).toEqual([
      { id: 'p1-L01', page: 1, text: 'HĐ', bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 } },
    ]);
  });

  it('Google từ chối (vd chưa bật thanh toán) → ApiFailure, in lý do ra log', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"billing disabled"}}', { status: 403 })));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(createVisionOcr({ GOOGLE_CLOUD_VISION_API_KEY: 'abc' }).readPages([Buffer.from('x')])).rejects.toBeInstanceOf(
      ApiFailure,
    );
    expect(String(err.mock.calls[0][0])).toContain('billing disabled');
    err.mockRestore();
  });

  it('có API key thì không cần file service account', () => {
    expect(checkVisionCredentials({ GOOGLE_CLOUD_VISION_API_KEY: 'abc' }, '/tmp')).toBeNull();
    expect(checkVisionCredentials({ GOOGLE_APPLICATION_CREDENTIALS: './khong-co.json' }, '/tmp')).toContain('Không thấy file');
  });
});
