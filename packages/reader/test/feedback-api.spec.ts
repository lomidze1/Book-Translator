import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { feedbackApi } from '../src/api/feedback-api';
import { setApiUrl } from '../src/api/api-client';

const TOKEN = 'tok-1';
const TRANSLATION = 'tr-1';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
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

describe('feedbackApi.report', () => {
  const input = {
    chapterNumber: 4,
    startPosition: 120,
    endPosition: 180,
    selectedText: 'გაუგებარი პასაჟი',
    comment: 'აზრი იკარგება',
  };

  it('POSTs the report to /api/translations/:id/feedback', async () => {
    const created = { id: 'fb-1', status: 'PENDING', reportCount: 1 };
    fetchMock.mockResolvedValue(jsonResponse(201, created));

    const result = await feedbackApi.report(TOKEN, TRANSLATION, input);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/translations/tr-1/feedback');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok-1');
    expect(JSON.parse(init.body)).toEqual(input);
    expect(result).toEqual(created);
  });

  it('sends the report without a comment when none was given', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'fb-2' }));
    const { comment: _comment, ...noComment } = input;

    await feedbackApi.report(TOKEN, TRANSLATION, noComment);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(noComment);
  });

  it('surfaces a quota-exceeded rejection from the API', async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { message: 'კვოტა ამოწურულია' }));

    await expect(feedbackApi.report(TOKEN, TRANSLATION, input)).rejects.toThrow('კვოტა ამოწურულია');
  });
});

describe('feedbackApi.getQuota', () => {
  it('GETs /api/translations/:id/feedback/quota and returns the quota', async () => {
    const quota = { used: 2, limit: 10, remaining: 8 };
    fetchMock.mockResolvedValue(jsonResponse(200, quota));

    const result = await feedbackApi.getQuota(TOKEN, TRANSLATION);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/translations/tr-1/feedback/quota');
    expect(init.method).toBeUndefined();
    expect(result).toEqual(quota);
  });
});

describe('feedbackApi.list', () => {
  it('GETs /api/translations/:id/feedback and returns all feedback rows', async () => {
    const rows = [
      { id: 'fb-1', status: 'APPLIED' },
      { id: 'fb-2', status: 'PENDING' },
    ];
    fetchMock.mockResolvedValue(jsonResponse(200, rows));

    const result = await feedbackApi.list(TOKEN, TRANSLATION);

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:4000/api/translations/tr-1/feedback');
    expect(result).toEqual(rows);
  });

  it('propagates a not-found error for an unknown translation', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { message: 'თარგმანი ვერ მოიძებნა' }));

    await expect(feedbackApi.list(TOKEN, 'missing')).rejects.toThrow('თარგმანი ვერ მოიძებნა');
  });
});
