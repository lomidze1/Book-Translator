// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNotes } from '../src/hooks/useNotes';
import { readerApi } from '../src/api/reader-api';
import type { ReaderNote } from '../src/types';

vi.mock('../src/api/reader-api', () => ({
  readerApi: {
    getNotes: vi.fn(),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  },
}));

const api = vi.mocked(readerApi);

const note = (over: Partial<ReaderNote> = {}): ReaderNote => ({
  id: 'n-1',
  bookId: 'book-1',
  chapterNumber: 1,
  content: 'ჩემი შენიშვნა',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getNotes.mockResolvedValue([]);
});

describe('useNotes — initial load', () => {
  it('fetches notes on mount', async () => {
    const rows = [note(), note({ id: 'n-2', highlightId: 'hl-1' })];
    api.getNotes.mockResolvedValue(rows);

    const { result } = renderHook(() => useNotes('book-1', 'tok'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getNotes).toHaveBeenCalledWith('tok', 'book-1');
    expect(result.current.notes).toEqual(rows);
  });

  it('settles without fetching when token is missing', async () => {
    const { result } = renderHook(() => useNotes('book-1', null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getNotes).not.toHaveBeenCalled();
  });

  it('records load failures, falling back for non-Error rejections', async () => {
    api.getNotes.mockRejectedValue(undefined);

    const { result } = renderHook(() => useNotes('book-1', 'tok'));

    await waitFor(() => expect(result.current.error).toBe('Failed to load notes'));
  });
});

describe('useNotes — addNote', () => {
  it('creates a note bound to a highlight and appends it', async () => {
    const created = note({ id: 'n-new', highlightId: 'hl-1', content: 'კარგი პასაჟია' });
    api.createNote.mockResolvedValue(created);

    const { result } = renderHook(() => useNotes('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: ReaderNote | undefined;
    await act(async () => {
      returned = await result.current.addNote({
        chapterNumber: 2, content: 'კარგი პასაჟია', highlightId: 'hl-1',
      });
    });

    expect(api.createNote).toHaveBeenCalledWith('tok', {
      bookId: 'book-1', chapterNumber: 2, content: 'კარგი პასაჟია', highlightId: 'hl-1',
    });
    expect(returned).toEqual(created);
    expect(result.current.notes).toEqual([created]);
  });

  it('is a no-op without a token', async () => {
    const { result } = renderHook(() => useNotes('book-1', null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addNote({ chapterNumber: 1, content: 'x' });
    });

    expect(api.createNote).not.toHaveBeenCalled();
  });
});

describe('useNotes — updateNote', () => {
  it('replaces the note with the server row (content AND updatedAt)', async () => {
    api.getNotes.mockResolvedValue([note({ id: 'n-1' }), note({ id: 'n-2' })]);
    const serverRow = note({ id: 'n-1', content: 'განახლებული', updatedAt: '2026-02-01T00:00:00.000Z' });
    api.updateNote.mockResolvedValue(serverRow);

    const { result } = renderHook(() => useNotes('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateNote('n-1', 'განახლებული');
    });

    expect(api.updateNote).toHaveBeenCalledWith('tok', 'n-1', 'განახლებული');
    const updated = result.current.notes.find((n) => n.id === 'n-1')!;
    expect(updated).toEqual(serverRow);
    // The sibling note is untouched.
    expect(result.current.notes.find((n) => n.id === 'n-2')!.content).toBe('ჩემი შენიშვნა');
  });

  it('keeps the old content when the update fails', async () => {
    api.getNotes.mockResolvedValue([note({ id: 'n-1' })]);
    api.updateNote.mockRejectedValue(new Error('შენიშვნა ვერ მოიძებნა'));

    const { result } = renderHook(() => useNotes('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.updateNote('n-1', 'ახალი');
      }),
    ).rejects.toThrow('შენიშვნა ვერ მოიძებნა');
    expect(result.current.notes[0].content).toBe('ჩემი შენიშვნა');
  });
});

describe('useNotes — removeNote', () => {
  it('deletes the note and drops it from state', async () => {
    api.getNotes.mockResolvedValue([note({ id: 'n-1' }), note({ id: 'n-2' })]);
    api.deleteNote.mockResolvedValue(undefined);

    const { result } = renderHook(() => useNotes('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.removeNote('n-1');
    });

    expect(api.deleteNote).toHaveBeenCalledWith('tok', 'n-1');
    expect(result.current.notes.map((n) => n.id)).toEqual(['n-2']);
  });

  it('keeps the note when the delete fails', async () => {
    api.getNotes.mockResolvedValue([note({ id: 'n-1' })]);
    api.deleteNote.mockRejectedValue(new Error('არ გაქვთ ამ შენიშვნის წაშლის უფლება'));

    const { result } = renderHook(() => useNotes('book-1', 'tok'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.removeNote('n-1');
      }),
    ).rejects.toThrow('წაშლის უფლება');
    expect(result.current.notes).toHaveLength(1);
  });
});
