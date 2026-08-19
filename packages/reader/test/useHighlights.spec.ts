// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useHighlights } from '../src/hooks/useHighlights';
import { readerApi } from '../src/api/reader-api';
import type { Highlight } from '../src/types';

vi.mock('../src/api/reader-api', () => ({
  readerApi: {
    getHighlights: vi.fn(),
    createHighlight: vi.fn(),
    updateHighlightColor: vi.fn(),
    deleteHighlight: vi.fn(),
  },
}));

const api = vi.mocked(readerApi);

const highlight = (over: Partial<Highlight> = {}): Highlight => ({
  id: 'hl-1',
  bookId: 'book-1',
  chapterNumber: 1,
  startPosition: 7,
  endPosition: 14,
  color: 'yellow',
  selectedText: 'ლამპარი',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getHighlights.mockResolvedValue([]);
});

describe('useHighlights — initial load', () => {
  it('fetches highlights on mount', async () => {
    const rows = [highlight(), highlight({ id: 'hl-2', color: 'blue' })];
    api.getHighlights.mockResolvedValue(rows);

    const { result } = renderHook(() => useHighlights('book-1', 'tok'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getHighlights).toHaveBeenCalledWith('tok', 'book-1');
    expect(result.current.highlights).toEqual(rows);
  });

  it('settles without fetching when there is no token', async () => {
    const { result } = renderHook(() => useHighlights('book-1', null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getHighlights).not.toHaveBeenCalled();
  });

  it('records the load error message', async () => {
    api.getHighlights.mockRejectedValue(new Error('ამ წიგნზე წვდომა არ გაქვთ'));

    const { result } = renderHook(() => useHighlights('book-1', 'tok'));

    await waitFor(() => expect(result.current.error).toBe('ამ წიგნზე წვდომა არ გაქვთ'));
    expect(result.current.highlights).toEqual([]);
  });

  it('uses the fallback message for a non-Error rejection', async () => {
    api.getHighlights.mockRejectedValue({ status: 500 });

    const { result } = renderHook(() => useHighlights('book-1', 'tok'));

    await waitFor(() => expect(result.current.error).toBe('Failed to load highlights'));
  });
});

describe('useHighlights — addHighlight', () => {
  it('creates the highlight with the bookId merged in and appends it', async () => {
    const created = highlight({ id: 'hl-new', color: 'green' });
    api.createHighlight.mockResolvedValue(created);

    const { result } = renderHook(() => useHighlights('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: Highlight | undefined;
    await act(async () => {
      returned = await result.current.addHighlight({
        chapterNumber: 1, startPosition: 7, endPosition: 14,
        selectedText: 'ლამპარი', color: 'green',
      });
    });

    expect(api.createHighlight).toHaveBeenCalledWith('tok', {
      bookId: 'book-1', chapterNumber: 1, startPosition: 7, endPosition: 14,
      selectedText: 'ლამპარი', color: 'green',
    });
    expect(returned).toEqual(created);
    expect(result.current.highlights).toEqual([created]);
  });

  it('is a no-op without a token', async () => {
    const { result } = renderHook(() => useHighlights('book-1', null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addHighlight({
        chapterNumber: 1, startPosition: 0, endPosition: 5, selectedText: 'ბაბუა',
      });
    });

    expect(api.createHighlight).not.toHaveBeenCalled();
  });

  it('propagates creation failures and leaves state untouched', async () => {
    api.createHighlight.mockRejectedValue(new Error('startPosition უნდა იყოს endPosition-ზე ნაკლები'));

    const { result } = renderHook(() => useHighlights('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.addHighlight({
          chapterNumber: 1, startPosition: 5, endPosition: 5, selectedText: 'x',
        });
      }),
    ).rejects.toThrow('startPosition');
    expect(result.current.highlights).toEqual([]);
  });
});

describe('useHighlights — updateColor', () => {
  it('recolors only the matching highlight, using the server-confirmed color', async () => {
    api.getHighlights.mockResolvedValue([
      highlight({ id: 'hl-1', color: 'yellow' }),
      highlight({ id: 'hl-2', color: 'yellow' }),
    ]);
    // Server is authoritative: it answers with the color it actually stored.
    api.updateHighlightColor.mockResolvedValue(highlight({ id: 'hl-1', color: 'red' }));

    const { result } = renderHook(() => useHighlights('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateColor('hl-1', 'red');
    });

    expect(api.updateHighlightColor).toHaveBeenCalledWith('tok', 'hl-1', 'red');
    expect(result.current.highlights.find((h) => h.id === 'hl-1')!.color).toBe('red');
    expect(result.current.highlights.find((h) => h.id === 'hl-2')!.color).toBe('yellow');
  });

  it('keeps the old color when the update fails', async () => {
    api.getHighlights.mockResolvedValue([highlight({ id: 'hl-1', color: 'yellow' })]);
    api.updateHighlightColor.mockRejectedValue(new Error('Highlight ვერ მოიძებნა'));

    const { result } = renderHook(() => useHighlights('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.updateColor('hl-1', 'blue');
      }),
    ).rejects.toThrow('Highlight ვერ მოიძებნა');
    expect(result.current.highlights[0].color).toBe('yellow');
  });
});

describe('useHighlights — removeHighlight', () => {
  it('deletes the highlight and drops it from state', async () => {
    api.getHighlights.mockResolvedValue([highlight({ id: 'hl-1' }), highlight({ id: 'hl-2' })]);
    api.deleteHighlight.mockResolvedValue(undefined);

    const { result } = renderHook(() => useHighlights('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.removeHighlight('hl-2');
    });

    expect(api.deleteHighlight).toHaveBeenCalledWith('tok', 'hl-2');
    expect(result.current.highlights.map((h) => h.id)).toEqual(['hl-1']);
  });
});
