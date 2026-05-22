import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithTimeout } from '../../src/common/fetch';

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves when the upstream responds in time', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const res = await fetchWithTimeout('https://example.test', {}, 1_000);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.test',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('throws a descriptive timeout error when upstream stalls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        // Replicate fetch behavior: reject with AbortError when signal aborts.
        return new Promise((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener('abort', () => {
            const err: any = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }),
    );

    await expect(fetchWithTimeout('https://slow.test', {}, 50)).rejects.toThrow(
      /timed out after 50ms/,
    );
  });

  it('propagates non-timeout errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(fetchWithTimeout('https://x.test', {}, 1_000)).rejects.toThrow('network down');
  });
});
