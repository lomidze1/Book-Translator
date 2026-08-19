// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBookmarks } from '../src/hooks/useBookmarks';
import { readerApi } from '../src/api/reader-api';
import type { Bookmark } from '../src/types';

vi.mock('../src/api/reader-api', () => ({
  readerApi: {
    getBookmarks: vi.fn(),
    createBookmark: vi.fn(),
    deleteBookmark: vi.fn(),
  },
}));

const api = vi.mocked(readerApi);

const bookmark = (over: Partial<Bookmark> = {}): Bookmark => ({
  id: 'bm-1',
  bookId: 'book-1',
  chapterNumber: 1,
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getBookmarks.mockResolvedValue([]);
});

describe('useBookmarks — initial load', () => {
  it('fetches bookmarks on mount and clears loading', async () => {
    const rows = [bookmark(), bookmark({ id: 'bm-2', chapterNumber: 2 })];
    api.getBookmarks.mockResolvedValue(rows);

    const { result } = renderHook(() => useBookmarks('book-1', 'tok'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getBookmarks).toHaveBeenCalledWith('tok', 'book-1');
    expect(result.current.bookmarks).toEqual(rows);
    expect(result.current.error).toBeNull();
  });

  it('skips fetching and settles immediately without a token', async () => {
    const { result } = renderHook(() => useBookmarks('book-1', null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getBookmarks).not.toHaveBeenCalled();
    expect(result.current.bookmarks).toEqual([]);
  });

  it('skips fetching without a bookId', async () => {
    const { result } = renderHook(() => useBookmarks('', 'tok'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getBookmarks).not.toHaveBeenCalled();
  });

  it('surfaces the error message when the load fails', async () => {
    api.getBookmarks.mockRejectedValue(new Error('Request failed: 500'));

    const { result } = renderHook(() => useBookmarks('book-1', 'tok'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Request failed: 500');
    expect(result.current.bookmarks).toEqual([]);
  });

  it('falls back to a generic message for a non-Error rejection', async () => {
    api.getBookmarks.mockRejectedValue('boom');

    const { result } = renderHook(() => useBookmarks('book-1', 'tok'));

    await waitFor(() => expect(result.current.error).toBe('Failed to load bookmarks'));
  });
});

describe('useBookmarks — addBookmark', () => {
  it('creates the bookmark and appends it to state', async () => {
    const created = bookmark({ id: 'bm-new', chapterNumber: 3, position: 42, label: 'აქ' });
    api.createBookmark.mockResolvedValue(created);

    const { result } = renderHook(() => useBookmarks('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: Bookmark | null | undefined;
    await act(async () => {
      returned = await result.current.addBookmark(3, 42, 'აქ');
    });

    expect(api.createBookmark).toHaveBeenCalledWith('tok', {
      bookId: 'book-1', chapterNumber: 3, position: 42, label: 'აქ',
    });
    expect(returned).toEqual(created);
    expect(result.current.bookmarks).toEqual([created]);
  });

  it('is a no-op without a token', async () => {
    const { result } = renderHook(() => useBookmarks('book-1', null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: Bookmark | null | undefined;
    await act(async () => {
      returned = await result.current.addBookmark(1, 0);
    });

    expect(returned).toBeUndefined();
    expect(api.createBookmark).not.toHaveBeenCalled();
  });

  it('returns null for a duplicate bookmark instead of throwing', async () => {
    api.createBookmark.mockRejectedValue(new Error('ეს bookmark უკვე არსებობს'));

    const { result } = renderHook(() => useBookmarks('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: Bookmark | null | undefined;
    await act(async () => {
      returned = await result.current.addBookmark(1, 0);
    });

    expect(returned).toBeNull();
    expect(result.current.bookmarks).toEqual([]);
  });

  it('rethrows non-duplicate errors', async () => {
    api.createBookmark.mockRejectedValue(new Error('Request failed: 500'));

    const { result } = renderHook(() => useBookmarks('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.addBookmark(1, 0);
      }),
    ).rejects.toThrow('Request failed: 500');
    expect(result.current.bookmarks).toEqual([]);
  });
});

describe('useBookmarks — removeBookmark', () => {
  it('deletes the bookmark and removes it from state', async () => {
    const rows = [bookmark({ id: 'bm-1' }), bookmark({ id: 'bm-2' })];
    api.getBookmarks.mockResolvedValue(rows);
    api.deleteBookmark.mockResolvedValue(undefined);

    const { result } = renderHook(() => useBookmarks('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.removeBookmark('bm-1');
    });

    expect(api.deleteBookmark).toHaveBeenCalledWith('tok', 'bm-1');
    expect(result.current.bookmarks.map((b) => b.id)).toEqual(['bm-2']);
  });

  it('keeps the bookmark when the delete fails', async () => {
    api.getBookmarks.mockResolvedValue([bookmark({ id: 'bm-1' })]);
    api.deleteBookmark.mockRejectedValue(new Error('Bookmark ვერ მოიძებნა'));

    const { result } = renderHook(() => useBookmarks('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.removeBookmark('bm-1');
      }),
    ).rejects.toThrow('Bookmark ვერ მოიძებნა');
    expect(result.current.bookmarks.map((b) => b.id)).toEqual(['bm-1']);
  });
});
