// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReadingProgress } from '../src/hooks/useReadingProgress';
import { readerApi } from '../src/api/reader-api';
import type { ReadingPosition } from '../src/types';

vi.mock('../src/api/reader-api', () => ({
  readerApi: {
    getProgress: vi.fn(),
    saveProgress: vi.fn(),
    saveProgressKeepalive: vi.fn(),
  },
}));

const api = vi.mocked(readerApi);

const AUTO_SAVE_INTERVAL = 30_000;

const position = (over: Partial<ReadingPosition> = {}): ReadingPosition => ({
  id: 'rp-1',
  bookId: 'book-1',
  currentChapter: 2,
  currentPosition: 500,
  percentage: 40,
  lastReadAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getProgress.mockResolvedValue(null);
  api.saveProgress.mockResolvedValue(position());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useReadingProgress — initial load', () => {
  it('loads the saved position on mount', async () => {
    api.getProgress.mockResolvedValue(position());

    const { result } = renderHook(() => useReadingProgress('book-1', 'tok'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getProgress).toHaveBeenCalledWith('tok', 'book-1');
    expect(result.current.progress).toEqual(position());
  });

  it('settles with null progress when nothing is saved yet', async () => {
    const { result } = renderHook(() => useReadingProgress('book-1', 'tok'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.progress).toBeNull();
  });

  it('swallows a load failure and still settles', async () => {
    api.getProgress.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useReadingProgress('book-1', 'tok'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.progress).toBeNull();
  });

  it('does not touch the API without a token', async () => {
    const { result } = renderHook(() => useReadingProgress('book-1', null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getProgress).not.toHaveBeenCalled();
  });
});

describe('useReadingProgress — debounced auto-save', () => {
  it('updateProgress only buffers; nothing is sent immediately', async () => {
    const { result } = renderHook(() => useReadingProgress('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.updateProgress(3, 120, 25);
    });

    expect(api.saveProgress).not.toHaveBeenCalled();
  });

  it('flushes the latest buffered position on the 30s tick', async () => {
    vi.useFakeTimers();
    const saved = position({ currentChapter: 3, currentPosition: 200, percentage: 30 });
    api.saveProgress.mockResolvedValue(saved);

    const { result } = renderHook(() => useReadingProgress('book-1', 'tok'));
    await act(async () => {}); // let the mount fetch settle

    act(() => {
      result.current.updateProgress(2, 100, 20);
      result.current.updateProgress(3, 200, 30); // newer position wins
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_INTERVAL);
    });

    expect(api.saveProgress).toHaveBeenCalledTimes(1);
    expect(api.saveProgress).toHaveBeenCalledWith('tok', {
      bookId: 'book-1', currentChapter: 3, currentPosition: 200, percentage: 30,
    });
    expect(result.current.progress).toEqual(saved);
  });

  it('skips the tick when nothing is pending', async () => {
    vi.useFakeTimers();
    renderHook(() => useReadingProgress('book-1', 'tok'));
    await act(async () => {});

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_INTERVAL * 2);
    });

    expect(api.saveProgress).not.toHaveBeenCalled();
  });

  it('clears the buffer after a flush — the next tick sends nothing', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useReadingProgress('book-1', 'tok'));
    await act(async () => {});

    act(() => {
      result.current.updateProgress(1, 50, 10);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_INTERVAL);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_INTERVAL);
    });

    expect(api.saveProgress).toHaveBeenCalledTimes(1);
  });

  it('keeps the buffer when the tick fails, so the next tick retries it', async () => {
    vi.useFakeTimers();
    api.saveProgress.mockRejectedValueOnce(new Error('offline'));
    const saved = position({ currentChapter: 1, currentPosition: 50, percentage: 10 });
    api.saveProgress.mockResolvedValue(saved);

    const { result } = renderHook(() => useReadingProgress('book-1', 'tok'));
    await act(async () => {});

    act(() => {
      result.current.updateProgress(1, 50, 10);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_INTERVAL); // fails, buffer survives
    });
    expect(result.current.progress).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_INTERVAL); // retried here
    });

    expect(api.saveProgress).toHaveBeenCalledTimes(2);
    expect(api.saveProgress).toHaveBeenLastCalledWith('tok', {
      bookId: 'book-1', currentChapter: 1, currentPosition: 50, percentage: 10,
    });
    expect(result.current.progress).toEqual(saved);
  });

  it('never auto-saves without a token', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useReadingProgress('book-1', null));
    await act(async () => {});

    act(() => {
      result.current.updateProgress(1, 50, 10);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_INTERVAL * 3);
    });

    expect(api.saveProgress).not.toHaveBeenCalled();
  });
});

describe('useReadingProgress — saveNow', () => {
  it('flushes immediately, updates progress and clears the buffer', async () => {
    vi.useFakeTimers();
    const saved = position({ percentage: 55 });
    api.saveProgress.mockResolvedValue(saved);

    const { result } = renderHook(() => useReadingProgress('book-1', 'tok'));
    await act(async () => {});

    act(() => {
      result.current.updateProgress(4, 900, 55);
    });
    await act(async () => {
      await result.current.saveNow();
    });

    expect(api.saveProgress).toHaveBeenCalledWith('tok', {
      bookId: 'book-1', currentChapter: 4, currentPosition: 900, percentage: 55,
    });
    expect(result.current.progress).toEqual(saved);

    // Buffer is empty: the next interval tick has nothing to send.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_INTERVAL);
    });
    expect(api.saveProgress).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when nothing is pending', async () => {
    const { result } = renderHook(() => useReadingProgress('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveNow();
    });

    expect(api.saveProgress).not.toHaveBeenCalled();
  });

  it('keeps the buffer on failure so the next tick retries the save', async () => {
    vi.useFakeTimers();
    api.saveProgress.mockRejectedValueOnce(new Error('offline'));
    api.saveProgress.mockResolvedValueOnce(position());

    const { result } = renderHook(() => useReadingProgress('book-1', 'tok'));
    await act(async () => {});

    act(() => {
      result.current.updateProgress(2, 100, 20);
    });
    await act(async () => {
      await result.current.saveNow(); // fails, buffer survives
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_INTERVAL); // retried here
    });

    expect(api.saveProgress).toHaveBeenCalledTimes(2);
    expect(api.saveProgress).toHaveBeenLastCalledWith('tok', {
      bookId: 'book-1', currentChapter: 2, currentPosition: 100, percentage: 20,
    });
  });
});

describe('useReadingProgress — lifecycle flushes', () => {
  it('flushes pending progress through the keepalive path on pagehide', async () => {
    const { result } = renderHook(() => useReadingProgress('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.updateProgress(5, 100, 60);
    });
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(api.saveProgressKeepalive).toHaveBeenCalledWith('tok', {
      bookId: 'book-1', currentChapter: 5, currentPosition: 100, percentage: 60,
    });
    expect(api.saveProgress).not.toHaveBeenCalled();
  });

  it('does nothing on pagehide when the buffer is empty', async () => {
    const { result } = renderHook(() => useReadingProgress('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(api.saveProgressKeepalive).not.toHaveBeenCalled();
  });

  it('saves pending progress once on unmount', async () => {
    const { result, unmount } = renderHook(() => useReadingProgress('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.updateProgress(6, 10, 70);
    });
    unmount();

    expect(api.saveProgress).toHaveBeenCalledWith('tok', {
      bookId: 'book-1', currentChapter: 6, currentPosition: 10, percentage: 70,
    });
  });

  it('does not save on unmount when nothing is pending', async () => {
    const { result, unmount } = renderHook(() => useReadingProgress('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    unmount();

    expect(api.saveProgress).not.toHaveBeenCalled();
  });
});
