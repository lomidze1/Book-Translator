// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';
import { ttsApi, type AudioChapterInfo, type AudioBookStatus } from '../src/api/tts-api';

vi.mock('../src/api/tts-api', () => ({
  ttsApi: {
    getChapters: vi.fn(),
    synthesizeBook: vi.fn(),
    getStatus: vi.fn(),
    getStreamUrl: vi.fn(),
  },
}));

const api = vi.mocked(ttsApi);

const chapter = (over: Partial<AudioChapterInfo> = {}): AudioChapterInfo => ({
  audioChapterId: 'ac-1',
  chapterNumber: 1,
  duration: 120,
  fileSize: 1024,
  format: 'mp3',
  status: 'COMPLETED',
  ...over,
});

const bookStatus = (over: Partial<AudioBookStatus> = {}): AudioBookStatus => ({
  id: 'ab-1',
  status: 'PROCESSING',
  progress: 50,
  totalDuration: null,
  totalSize: null,
  totalChapters: 10,
  completedChapters: 5,
  chapters: [chapter()],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getChapters.mockResolvedValue([]);
});

describe('useAudioPlayer — initial chapter fetch', () => {
  it('loads chapters and marks audio as available when some exist', async () => {
    const chapters = [chapter(), chapter({ audioChapterId: 'ac-2', chapterNumber: 2 })];
    api.getChapters.mockResolvedValue(chapters);

    const { result } = renderHook(() => useAudioPlayer('book-1', 'tok'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getChapters).toHaveBeenCalledWith('tok', 'book-1');
    expect(result.current.chapters).toEqual(chapters);
    expect(result.current.status).toBe('available');
  });

  it('leaves status null when the book has no audio yet', async () => {
    const { result } = renderHook(() => useAudioPlayer('book-1', 'tok'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toBeNull();
    expect(result.current.chapters).toEqual([]);
  });

  it('swallows a fetch failure and still settles', async () => {
    api.getChapters.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useAudioPlayer('book-1', 'tok'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.chapters).toEqual([]);
    expect(result.current.status).toBeNull();
  });

  it('does not fetch without a token', async () => {
    const { result } = renderHook(() => useAudioPlayer('book-1', null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getChapters).not.toHaveBeenCalled();
  });
});

describe('useAudioPlayer — synthesizeBook', () => {
  it('queues synthesis and tracks the new audio book', async () => {
    const queued = { audioBookId: 'ab-1', totalChapters: 10, queued: 10, status: 'QUEUED' };
    api.synthesizeBook.mockResolvedValue(queued);

    const { result } = renderHook(() => useAudioPlayer('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: typeof queued | undefined;
    await act(async () => {
      returned = await result.current.synthesizeBook('voice-ka', 1.25);
    });

    expect(api.synthesizeBook).toHaveBeenCalledWith('tok', {
      bookId: 'book-1', voiceId: 'voice-ka', speed: 1.25,
    });
    expect(returned).toEqual(queued);
    expect(result.current.audioBookId).toBe('ab-1');
    expect(result.current.status).toBe('queued');
  });

  it('is a no-op without a token', async () => {
    const { result } = renderHook(() => useAudioPlayer('book-1', null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.synthesizeBook();
    });

    expect(api.synthesizeBook).not.toHaveBeenCalled();
    expect(result.current.audioBookId).toBeNull();
  });
});

describe('useAudioPlayer — refreshStatus', () => {
  it('does nothing before a synthesis has been started', async () => {
    const { result } = renderHook(() => useAudioPlayer('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refreshStatus();
    });

    expect(api.getStatus).not.toHaveBeenCalled();
  });

  it('pulls status, progress and chapters after synthesis started', async () => {
    api.synthesizeBook.mockResolvedValue({ audioBookId: 'ab-1', totalChapters: 10, queued: 10, status: 'QUEUED' });
    const refreshed = bookStatus({ status: 'PROCESSING', progress: 70, chapters: [chapter(), chapter({ audioChapterId: 'ac-2' })] });
    api.getStatus.mockResolvedValue(refreshed);

    const { result } = renderHook(() => useAudioPlayer('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.synthesizeBook();
    });
    await act(async () => {
      await result.current.refreshStatus();
    });

    expect(api.getStatus).toHaveBeenCalledWith('tok', 'ab-1');
    expect(result.current.status).toBe('PROCESSING');
    expect(result.current.progress).toBe(70);
    expect(result.current.chapters).toHaveLength(2);
  });
});

describe('useAudioPlayer — getStreamUrl', () => {
  it('returns null without a token', async () => {
    const { result } = renderHook(() => useAudioPlayer('book-1', null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let url: string | null = 'sentinel';
    await act(async () => {
      url = await result.current.getStreamUrl('ac-1');
    });

    expect(url).toBeNull();
    expect(api.getStreamUrl).not.toHaveBeenCalled();
  });

  it('delegates to the API with a token', async () => {
    api.getStreamUrl.mockResolvedValue('https://cdn.example/ac-1.mp3');

    const { result } = renderHook(() => useAudioPlayer('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let url: string | null = null;
    await act(async () => {
      url = await result.current.getStreamUrl('ac-1');
    });

    expect(api.getStreamUrl).toHaveBeenCalledWith('tok', 'ac-1');
    expect(url).toBe('https://cdn.example/ac-1.mp3');
  });
});
