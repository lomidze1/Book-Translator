// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReaderSettings } from '../src/hooks/useReaderSettings';
import { DEFAULT_READER_SETTINGS } from '../src/types';

const STORAGE_KEY = 'reader-settings';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useReaderSettings — loading', () => {
  it('starts with the reading-spec defaults when nothing is stored', async () => {
    const { result } = renderHook(() => useReaderSettings());

    await waitFor(() => expect(result.current.settings).toEqual(DEFAULT_READER_SETTINGS));
    expect(result.current.settings.fontSize).toBe(20);
    expect(result.current.settings.lineHeight).toBe(1.8);
    expect(result.current.settings.theme).toBe('light');
  });

  it('hydrates stored settings after mount', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ fontSize: 22, theme: 'dark', fontFamily: 'bpg', lineHeight: 2.0, scrollMode: false }),
    );

    const { result } = renderHook(() => useReaderSettings());

    await waitFor(() =>
      expect(result.current.settings).toEqual({
        fontSize: 22, theme: 'dark', fontFamily: 'bpg', lineHeight: 2.0, scrollMode: false,
      }),
    );
  });

  it('merges a partial stored payload over the defaults (forward compatibility)', async () => {
    // A row written by an older client that only knew about fontSize.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontSize: 17 }));

    const { result } = renderHook(() => useReaderSettings());

    await waitFor(() => expect(result.current.settings.fontSize).toBe(17));
    expect(result.current.settings).toEqual({ ...DEFAULT_READER_SETTINGS, fontSize: 17 });
  });

  it('falls back to defaults when the stored payload is corrupted JSON', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    const { result } = renderHook(() => useReaderSettings());

    await waitFor(() => expect(result.current.settings).toEqual(DEFAULT_READER_SETTINGS));
  });

  it('falls back to defaults when localStorage.getItem throws (private mode)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    const { result } = renderHook(() => useReaderSettings());

    await waitFor(() => expect(result.current.settings).toEqual(DEFAULT_READER_SETTINGS));
  });
});

describe('useReaderSettings — setSettings', () => {
  it('merges a partial update into the current settings', async () => {
    const { result } = renderHook(() => useReaderSettings());
    await waitFor(() => expect(result.current.settings).toEqual(DEFAULT_READER_SETTINGS));

    act(() => {
      result.current.setSettings({ theme: 'sepia' });
    });

    expect(result.current.settings).toEqual({ ...DEFAULT_READER_SETTINGS, theme: 'sepia' });
  });

  it('persists every update to localStorage', async () => {
    const { result } = renderHook(() => useReaderSettings());
    await waitFor(() => expect(result.current.settings).toEqual(DEFAULT_READER_SETTINGS));

    act(() => {
      result.current.setSettings({ fontSize: 23, theme: 'dark' });
    });

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      ...DEFAULT_READER_SETTINGS, fontSize: 23, theme: 'dark',
    });
  });

  it('accumulates successive partial updates', async () => {
    const { result } = renderHook(() => useReaderSettings());
    await waitFor(() => expect(result.current.settings).toEqual(DEFAULT_READER_SETTINGS));

    act(() => {
      result.current.setSettings({ fontSize: 21 });
    });
    act(() => {
      result.current.setSettings({ lineHeight: 2.2 });
    });

    expect(result.current.settings).toEqual({
      ...DEFAULT_READER_SETTINGS, fontSize: 21, lineHeight: 2.2,
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).fontSize).toBe(21);
  });

  it('still updates state when persistence fails (quota exceeded)', async () => {
    const { result } = renderHook(() => useReaderSettings());
    await waitFor(() => expect(result.current.settings).toEqual(DEFAULT_READER_SETTINGS));

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    act(() => {
      result.current.setSettings({ theme: 'dark' });
    });

    expect(result.current.settings.theme).toBe('dark');
  });

  it('round-trips: a second mount sees the settings the first mount saved', async () => {
    const first = renderHook(() => useReaderSettings());
    await waitFor(() => expect(first.result.current.settings).toEqual(DEFAULT_READER_SETTINGS));
    act(() => {
      first.result.current.setSettings({ fontFamily: 'sans-serif', scrollMode: false });
    });
    first.unmount();

    const second = renderHook(() => useReaderSettings());
    await waitFor(() =>
      expect(second.result.current.settings).toEqual({
        ...DEFAULT_READER_SETTINGS, fontFamily: 'sans-serif', scrollMode: false,
      }),
    );
  });
});
