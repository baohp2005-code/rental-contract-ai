import { DEFAULT_API_URL, resolveApiUrl } from '@/lib/api';

describe('resolveApiUrl', () => {
  it('không đặt gì thì dùng backend chung trên Render', () => {
    expect(resolveApiUrl(undefined)).toBe(DEFAULT_API_URL);
    expect(resolveApiUrl('  ')).toBe(DEFAULT_API_URL);
    expect(DEFAULT_API_URL).toMatch(/^https:\/\//);
  });

  it('"mock" thì dùng dữ liệu mẫu', () => {
    expect(resolveApiUrl('mock')).toBeNull();
    expect(resolveApiUrl(' MOCK ')).toBeNull();
  });

  it('địa chỉ khác thì dùng đúng địa chỉ đó', () => {
    expect(resolveApiUrl('http://192.168.1.23:8787')).toBe('http://192.168.1.23:8787');
  });
});
