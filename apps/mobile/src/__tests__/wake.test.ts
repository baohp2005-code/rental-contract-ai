import { createHttpClient, WAKE_INTERVAL_MS } from '@/lib/api/http';
import { createMockClient } from '@/lib/api/mock';

describe('đánh thức backend (Render ngủ sau 15 phút)', () => {
  const realFetch = globalThis.fetch;
  let fetchMock: jest.Mock;
  let now = 1_000_000;

  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock = jest.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('gọi GET /health, không gọi lại trong vài phút, hết hạn thì gọi tiếp', () => {
    const client = createHttpClient('https://example.onrender.com/');
    client.wake();
    client.wake();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.onrender.com/health');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });

    now += WAKE_INTERVAL_MS - 1;
    client.wake();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += 1;
    client.wake();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('mất mạng lúc đánh thức thì im lặng, không ném lỗi ra app', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    const client = createHttpClient('https://example.onrender.com');
    expect(() => client.wake()).not.toThrow();
    // Chờ promise bên trong chạy xong: nếu có lỗi không bắt, jest sẽ báo unhandled rejection.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('dữ liệu mẫu thì không gọi mạng', () => {
    createMockClient().wake();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
