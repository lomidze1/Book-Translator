import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readerApi } from '../src/api/reader-api';
import { setApiUrl } from '../src/api/api-client';

const TOKEN = 'tok-1';
const BOOK = 'book-1';

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

const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1];

describe('progress endpoints', () => {
  it('saveProgress POSTs the full payload to /api/reader/progress', async () => {
    const saved = { id: 'rp-1', bookId: BOOK, currentChapter: 2, currentPosition: 10, percentage: 20 };
    fetchMock.mockResolvedValue(jsonResponse(200, saved));

    const result = await readerApi.saveProgress(TOKEN, {
      bookId: BOOK, currentChapter: 2, currentPosition: 10, percentage: 20,
    });

    const [url, init] = lastCall();
    expect(url).toBe('http://localhost:4000/api/reader/progress');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ bookId: BOOK, currentChapter: 2, currentPosition: 10, percentage: 20 });
    expect(result).toEqual(saved);
  });

  it('getProgress GETs /api/reader/progress/:bookId and passes null through', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, null));

    const result = await readerApi.getProgress(TOKEN, BOOK);

    expect(lastCall()[0]).toBe('http://localhost:4000/api/reader/progress/book-1');
    expect(result).toBeNull();
  });

  it('saveProgressKeepalive fires a keepalive POST without awaiting it', () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    const returned = readerApi.saveProgressKeepalive(TOKEN, {
      bookId: BOOK, currentChapter: 1, currentPosition: 5, percentage: 1,
    });

    expect(returned).toBeUndefined();
    const [url, init] = lastCall();
    expect(url).toBe('http://localhost:4000/api/reader/progress');
    expect(init.keepalive).toBe(true);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok-1');
    expect(JSON.parse(init.body)).toMatchObject({ bookId: BOOK, percentage: 1 });
  });

  it('saveProgressKeepalive swallows a synchronous fetch failure (page is unloading)', () => {
    fetchMock.mockImplementation(() => {
      throw new Error('fetch not available during unload');
    });

    expect(() =>
      readerApi.saveProgressKeepalive(TOKEN, {
        bookId: BOOK, currentChapter: 1, currentPosition: 0, percentage: 0,
      }),
    ).not.toThrow();
  });
});

describe('bookmark endpoints', () => {
  it('createBookmark POSTs to /api/reader/bookmarks', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'bm-1' }));

    await readerApi.createBookmark(TOKEN, { bookId: BOOK, chapterNumber: 3, position: 42, label: 'აქ' });

    const [url, init] = lastCall();
    expect(url).toBe('http://localhost:4000/api/reader/bookmarks');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ bookId: BOOK, chapterNumber: 3, position: 42, label: 'აქ' });
  });

  it('deleteBookmark DELETEs /api/reader/bookmarks/:id and resolves undefined on 204', async () => {
    fetchMock.mockResolvedValue(jsonResponse(204, undefined));

    const result = await readerApi.deleteBookmark(TOKEN, 'bm-9');

    const [url, init] = lastCall();
    expect(url).toBe('http://localhost:4000/api/reader/bookmarks/bm-9');
    expect(init.method).toBe('DELETE');
    expect(result).toBeUndefined();
  });

  it('getBookmarks fetches a single page when the first batch is short', async () => {
    const rows = [{ id: 'bm-1' }, { id: 'bm-2' }];
    fetchMock.mockResolvedValue(jsonResponse(200, rows));

    const result = await readerApi.getBookmarks(TOKEN, BOOK);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:4000/api/reader/bookmarks/book-1?page=1&limit=100',
    );
    expect(result).toEqual(rows);
  });

  it('getBookmarks walks pages until a short batch and concatenates in order', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: `bm-${i}` }));
    const page2 = Array.from({ length: 30 }, (_, i) => ({ id: `bm-${100 + i}` }));
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, page1))
      .mockResolvedValueOnce(jsonResponse(200, page2));

    const result = await readerApi.getBookmarks(TOKEN, BOOK);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('page=1&limit=100');
    expect(fetchMock.mock.calls[1][0]).toContain('page=2&limit=100');
    expect(result).toHaveLength(130);
    expect(result[0].id).toBe('bm-0');
    expect(result[129].id).toBe('bm-129');
  });

  it('getBookmarks stops after an exactly-full final page followed by an empty one', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: `bm-${i}` }));
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, fullPage))
      .mockResolvedValueOnce(jsonResponse(200, []));

    const result = await readerApi.getBookmarks(TOKEN, BOOK);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(100);
  });

  it('getBookmarks propagates an error from a later page', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: `bm-${i}` }));
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, fullPage))
      .mockResolvedValueOnce(jsonResponse(500, { message: 'boom' }));

    await expect(readerApi.getBookmarks(TOKEN, BOOK)).rejects.toThrow('boom');
  });
});

describe('highlight endpoints', () => {
  it('createHighlight POSTs the geometry payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'hl-1' }));

    await readerApi.createHighlight(TOKEN, {
      bookId: BOOK, chapterNumber: 1, startPosition: 7, endPosition: 14,
      selectedText: 'ლამპარი', color: 'blue',
    });

    const [url, init] = lastCall();
    expect(url).toBe('http://localhost:4000/api/reader/highlights');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      bookId: BOOK, chapterNumber: 1, startPosition: 7, endPosition: 14,
      selectedText: 'ლამპარი', color: 'blue',
    });
  });

  it('getHighlights pages through /api/reader/highlights/:bookId', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: `hl-${i}` }));
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, page1))
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 'hl-100' }]));

    const result = await readerApi.getHighlights(TOKEN, BOOK);

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:4000/api/reader/highlights/book-1?page=1&limit=100',
    );
    expect(fetchMock.mock.calls[1][0]).toContain('page=2');
    expect(result).toHaveLength(101);
  });

  it('updateHighlightColor PATCHes only the color', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'hl-1', color: 'red' }));

    const result = await readerApi.updateHighlightColor(TOKEN, 'hl-1', 'red');

    const [url, init] = lastCall();
    expect(url).toBe('http://localhost:4000/api/reader/highlights/hl-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ color: 'red' });
    expect(result.color).toBe('red');
  });

  it('deleteHighlight DELETEs /api/reader/highlights/:id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(204, undefined));

    await readerApi.deleteHighlight(TOKEN, 'hl-1');

    const [url, init] = lastCall();
    expect(url).toBe('http://localhost:4000/api/reader/highlights/hl-1');
    expect(init.method).toBe('DELETE');
  });
});

describe('note endpoints', () => {
  it('createNote POSTs content with an optional highlightId', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'n-1' }));

    await readerApi.createNote(TOKEN, {
      bookId: BOOK, chapterNumber: 2, content: 'შენიშვნა', highlightId: 'hl-1',
    });

    const [url, init] = lastCall();
    expect(url).toBe('http://localhost:4000/api/reader/notes');
    expect(JSON.parse(init.body)).toEqual({
      bookId: BOOK, chapterNumber: 2, content: 'შენიშვნა', highlightId: 'hl-1',
    });
  });

  it('getNotes pages through /api/reader/notes/:bookId', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [{ id: 'n-1' }]));

    const result = await readerApi.getNotes(TOKEN, BOOK);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:4000/api/reader/notes/book-1?page=1&limit=100',
    );
    expect(result).toEqual([{ id: 'n-1' }]);
  });

  it('updateNote PATCHes only the content', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'n-1', content: 'ახალი' }));

    await readerApi.updateNote(TOKEN, 'n-1', 'ახალი');

    const [url, init] = lastCall();
    expect(url).toBe('http://localhost:4000/api/reader/notes/n-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ content: 'ახალი' });
  });

  it('deleteNote DELETEs /api/reader/notes/:id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(204, undefined));

    await readerApi.deleteNote(TOKEN, 'n-1');

    const [url, init] = lastCall();
    expect(url).toBe('http://localhost:4000/api/reader/notes/n-1');
    expect(init.method).toBe('DELETE');
  });
});
