import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ttsApi } from '../src/api/tts-api';
import { setApiUrl } from '../src/api/api-client';

const TOKEN = 'tok-1';

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

describe('ttsApi.synthesizeBook', () => {
  it('POSTs the synthesis request to /api/tts/synthesize-book', async () => {
    const queued = { audioBookId: 'ab-1', totalChapters: 12, queued: 12, status: 'QUEUED' };
    fetchMock.mockResolvedValue(jsonResponse(201, queued));

    const result = await ttsApi.synthesizeBook(TOKEN, {
      bookId: 'book-1', voiceId: 'voice-ka-1', speed: 1.25, provider: 'elevenlabs',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/tts/synthesize-book');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      bookId: 'book-1', voiceId: 'voice-ka-1', speed: 1.25, provider: 'elevenlabs',
    });
    expect(result).toEqual(queued);
  });

  it('omits optional fields from the payload when not provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { audioBookId: 'ab-1' }));

    await ttsApi.synthesizeBook(TOKEN, { bookId: 'book-1' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ bookId: 'book-1' });
  });
});

describe('ttsApi.synthesizeChapter', () => {
  it('POSTs a single-chapter request to /api/tts/synthesize', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { audioChapterId: 'ac-1', status: 'QUEUED' }));

    await ttsApi.synthesizeChapter(TOKEN, { bookId: 'book-1', chapterNumber: 3 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/tts/synthesize');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ bookId: 'book-1', chapterNumber: 3 });
  });
});

describe('ttsApi reads', () => {
  it('getVoices GETs /api/tts/voices', async () => {
    const voices = [{ id: 'v1', name: 'ნინო', language: 'ka', gender: 'female', provider: 'azure' }];
    fetchMock.mockResolvedValue(jsonResponse(200, voices));

    const result = await ttsApi.getVoices(TOKEN);

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:4000/api/tts/voices');
    expect(result).toEqual(voices);
  });

  it('getStatus GETs /api/tts/status/:audioBookId', async () => {
    const status = { id: 'ab-1', status: 'PROCESSING', progress: 40, chapters: [] };
    fetchMock.mockResolvedValue(jsonResponse(200, status));

    const result = await ttsApi.getStatus(TOKEN, 'ab-1');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:4000/api/tts/status/ab-1');
    expect(result).toEqual(status);
  });

  it('getStreamUrl GETs /api/tts/stream/:audioChapterId and returns the signed URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, 'https://cdn.example/audio/ac-1.mp3?sig=x'));

    const result = await ttsApi.getStreamUrl(TOKEN, 'ac-1');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:4000/api/tts/stream/ac-1');
    expect(result).toBe('https://cdn.example/audio/ac-1.mp3?sig=x');
  });

  it('getChapters GETs /api/tts/chapters/:bookId', async () => {
    const chapters = [{ audioChapterId: 'ac-1', chapterNumber: 1, status: 'COMPLETED' }];
    fetchMock.mockResolvedValue(jsonResponse(200, chapters));

    const result = await ttsApi.getChapters(TOKEN, 'book-1');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:4000/api/tts/chapters/book-1');
    expect(result).toEqual(chapters);
  });

  it('getAudioUrl GETs /api/tts/audio/:bookId/:chapterNumber and passes null through', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, null));

    const result = await ttsApi.getAudioUrl(TOKEN, 'book-1', 7);

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:4000/api/tts/audio/book-1/7');
    expect(result).toBeNull();
  });
});

describe('ttsApi.deleteAudioBook', () => {
  it('DELETEs /api/tts/audio/:audioBookId and resolves undefined on 204', async () => {
    fetchMock.mockResolvedValue(jsonResponse(204, undefined));

    const result = await ttsApi.deleteAudioBook(TOKEN, 'ab-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/tts/audio/ab-1');
    expect(init.method).toBe('DELETE');
    expect(result).toBeUndefined();
  });
});

describe('error propagation', () => {
  it('surfaces API errors with their message', async () => {
    fetchMock.mockResolvedValue(jsonResponse(402, { message: 'გადახდა საჭიროა' }));

    await expect(ttsApi.synthesizeBook(TOKEN, { bookId: 'book-1' })).rejects.toThrow(
      'გადახდა საჭიროა',
    );
  });
});
