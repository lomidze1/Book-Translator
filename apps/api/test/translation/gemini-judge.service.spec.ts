import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiJudgeService } from '../../src/translation/gemini-judge.service';

vi.mock('../../src/common/fetch', () => ({
  fetchWithTimeout: vi.fn(),
}));

const makeConfig = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as any;

const geminiResponse = (payload: unknown) => ({
  ok: true,
  json: async () => ({
    candidates: [{ content: { parts: [{ text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] } }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
  }),
});

describe('GeminiJudgeService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const fetchModule = await import('../../src/common/fetch');
    fetchMock = fetchModule.fetchWithTimeout as unknown as ReturnType<typeof vi.fn>;
  });

  const createService = (values: Record<string, string | undefined>) => {
    const service = new GeminiJudgeService(makeConfig(values));
    service.onModuleInit();
    return service;
  };

  it('should be disabled without GEMINI_API_KEY and return null without calling the API', async () => {
    const service = createService({});

    expect(service.isEnabled()).toBe(false);
    const result = await service.judgeSample('source', 'თარგმანი');
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should parse a valid judge response', async () => {
    const service = createService({ GEMINI_API_KEY: 'test-key' });
    fetchMock.mockResolvedValue(
      geminiResponse({
        accuracy: 4,
        fluency: 5,
        consistency: 4,
        overall: 4,
        issues: [{ type: 'calque', quote: 'მიიღო გადაწყვეტილება', note: 'უფრო ბუნებრივია „გადაწყვიტა"' }],
      }),
    );

    const result = await service.judgeSample('He decided.', 'მან მიიღო გადაწყვეტილება.');

    expect(result).toEqual({
      accuracy: 4,
      fluency: 5,
      consistency: 4,
      overall: 4,
      issues: [{ type: 'calque', quote: 'მიიღო გადაწყვეტილება', note: 'უფრო ბუნებრივია „გადაწყვიტა"' }],
    });
  });

  it('should send the API key in a header, never in the URL', async () => {
    const service = createService({ GEMINI_API_KEY: 'secret-key' });
    fetchMock.mockResolvedValue(
      geminiResponse({ accuracy: 5, fluency: 5, consistency: 5, overall: 5, issues: [] }),
    );

    await service.judgeSample('src', 'თარგმანი');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain('secret-key');
    expect(init.headers['x-goog-api-key']).toBe('secret-key');
  });

  it('should use the configured model in the URL', async () => {
    const service = createService({ GEMINI_API_KEY: 'k', GEMINI_JUDGE_MODEL: 'gemini-custom' });
    fetchMock.mockResolvedValue(
      geminiResponse({ accuracy: 3, fluency: 3, consistency: 3, overall: 3, issues: [] }),
    );

    await service.judgeSample('src', 'თარგმანი');

    expect(fetchMock.mock.calls[0][0]).toContain('gemini-custom');
  });

  it('should tolerate markdown fences around the JSON', async () => {
    const service = createService({ GEMINI_API_KEY: 'k' });
    fetchMock.mockResolvedValue(
      geminiResponse('```json\n{"accuracy":3,"fluency":4,"consistency":3,"overall":3,"issues":[]}\n```'),
    );

    const result = await service.judgeSample('src', 'თარგმანი');
    expect(result?.overall).toBe(3);
  });

  it('should clamp out-of-range scores into 1..5', async () => {
    const service = createService({ GEMINI_API_KEY: 'k' });
    fetchMock.mockResolvedValue(
      geminiResponse({ accuracy: 7, fluency: 0, consistency: 3.7, overall: -2, issues: [] }),
    );

    const result = await service.judgeSample('src', 'თარგმანი');
    expect(result).toEqual({ accuracy: 5, fluency: 1, consistency: 3.7, overall: 1, issues: [] });
  });

  it('should return null on an API error response without throwing', async () => {
    const service = createService({ GEMINI_API_KEY: 'k' });
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' });

    const result = await service.judgeSample('src', 'თარგმანი');
    expect(result).toBeNull();
  });

  it('should return null on unparseable output without throwing', async () => {
    const service = createService({ GEMINI_API_KEY: 'k' });
    fetchMock.mockResolvedValue(geminiResponse('sorry, I cannot evaluate this'));

    const result = await service.judgeSample('src', 'თარგმანი');
    expect(result).toBeNull();
  });

  it('should return null when fetch itself rejects (network/timeout)', async () => {
    const service = createService({ GEMINI_API_KEY: 'k' });
    fetchMock.mockRejectedValue(new Error('Request timed out'));

    const result = await service.judgeSample('src', 'თარგმანი');
    expect(result).toBeNull();
  });
});
