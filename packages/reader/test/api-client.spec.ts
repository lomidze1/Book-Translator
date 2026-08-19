import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRequest, setApiUrl, getApiUrl } from '../src/api/api-client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function brokenJsonResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON');
    },
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  setApiUrl('http://localhost:4000');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('setApiUrl / getApiUrl', () => {
  it('returns the configured base URL', () => {
    setApiUrl('https://api.example.ge');
    expect(getApiUrl()).toBe('https://api.example.ge');
  });

  it('routes subsequent requests through the configured base URL', async () => {
    setApiUrl('https://api.example.ge');
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiRequest('/reader', '/progress/book-1', 'tok');

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.ge/api/reader/progress/book-1');
  });
});

describe('apiRequest — request shape', () => {
  it('builds the URL as <base>/api<basePath><path>', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiRequest('/tts', '/voices', 'tok');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:4000/api/tts/voices');
  });

  it('sends the Bearer token and JSON Content-Type on every request', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiRequest('/reader', '/bookmarks', 'my-token');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer my-token',
    });
  });

  it('always disables caching', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiRequest('/reader', '/highlights/book-1', 'tok');

    expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
  });

  it('passes method and body through from options', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'x' }));
    const body = JSON.stringify({ bookId: 'b1' });

    await apiRequest('/reader', '/bookmarks', 'tok', { method: 'POST', body });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(body);
  });

  it('defaults to GET when no options are given', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiRequest('/reader', '/notes/book-1', 'tok');

    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
  });

  it('lets caller headers extend and override the defaults', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiRequest('/reader', '/notes', 'tok', {
      headers: { 'X-Extra': '1', 'Content-Type': 'text/plain' },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['X-Extra']).toBe('1');
    expect(init.headers['Content-Type']).toBe('text/plain');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });
});

describe('apiRequest — response handling', () => {
  it('parses and returns the JSON body on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'bm-1', label: 'თავი' }));

    const result = await apiRequest<{ id: string; label: string }>('/reader', '/bookmarks/b', 't');

    expect(result).toEqual({ id: 'bm-1', label: 'თავი' });
  });

  it('returns undefined for a 204 No Content without touching the body', async () => {
    const res = brokenJsonResponse(204); // json() would throw if called
    fetchMock.mockResolvedValue(res);

    const result = await apiRequest<void>('/reader', '/bookmarks/bm-1', 't', { method: 'DELETE' });

    expect(result).toBeUndefined();
  });

  it('throws the API error message from a JSON error body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { message: 'ამ წიგნზე წვდომა არ გაქვთ' }));

    await expect(apiRequest('/reader', '/progress', 't')).rejects.toThrow(
      'ამ წიგნზე წვდომა არ გაქვთ',
    );
  });

  it('falls back to a status message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(brokenJsonResponse(502));

    await expect(apiRequest('/reader', '/progress', 't')).rejects.toThrow('Request failed: 502');
  });

  it('falls back to a status message when the JSON error body has no message', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'Internal' }));

    await expect(apiRequest('/reader', '/progress', 't')).rejects.toThrow('Request failed: 500');
  });

  it('propagates network failures from fetch itself', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiRequest('/reader', '/progress', 't')).rejects.toThrow('Failed to fetch');
  });
});
