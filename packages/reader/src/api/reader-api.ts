import { apiRequest, getApiUrl } from './api-client';
import type { ReadingPosition, Bookmark, Highlight, ReaderNote } from '../types';

const BASE = '/reader';

// The API caps list endpoints at 100 items per page — walk every page so
// heavy annotators don't silently lose items past the first 100.
const PAGE_SIZE = 100;

async function fetchAllPages<T>(fetchPage: (page: number) => Promise<T[]>): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page++) {
    const batch = await fetchPage(page);
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return all;
}

export const readerApi = {
  // Progress
  saveProgress(token: string, data: { bookId: string; currentChapter: number; currentPosition: number; percentage: number }) {
    return apiRequest<ReadingPosition>(BASE, '/progress', token, { method: 'POST', body: JSON.stringify(data) });
  },

  getProgress(token: string, bookId: string) {
    return apiRequest<ReadingPosition | null>(BASE, `/progress/${bookId}`, token);
  },

  /** Fire-and-forget save that survives page unload (pagehide flush). */
  saveProgressKeepalive(token: string, data: { bookId: string; currentChapter: number; currentPosition: number; percentage: number }) {
    try {
      // The .catch is deliberate: a rejected keepalive during unload must not
      // surface as an unhandled promise rejection.
      void fetch(`${getApiUrl()}/api${BASE}/progress`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      }).catch(() => {});
    } catch {
      // Best effort — the page is going away.
    }
  },

  // Bookmarks
  createBookmark(token: string, data: { bookId: string; chapterNumber: number; position: number; label?: string }) {
    return apiRequest<Bookmark>(BASE, '/bookmarks', token, { method: 'POST', body: JSON.stringify(data) });
  },

  getBookmarks(token: string, bookId: string) {
    return fetchAllPages<Bookmark>((page) =>
      apiRequest<Bookmark[]>(BASE, `/bookmarks/${bookId}?page=${page}&limit=${PAGE_SIZE}`, token),
    );
  },

  deleteBookmark(token: string, id: string) {
    return apiRequest<void>(BASE, `/bookmarks/${id}`, token, { method: 'DELETE' });
  },

  // Highlights
  createHighlight(token: string, data: { bookId: string; chapterNumber: number; startPosition: number; endPosition: number; selectedText: string; color?: string }) {
    return apiRequest<Highlight>(BASE, '/highlights', token, { method: 'POST', body: JSON.stringify(data) });
  },

  getHighlights(token: string, bookId: string) {
    return fetchAllPages<Highlight>((page) =>
      apiRequest<Highlight[]>(BASE, `/highlights/${bookId}?page=${page}&limit=${PAGE_SIZE}`, token),
    );
  },

  updateHighlightColor(token: string, id: string, color: string) {
    return apiRequest<Highlight>(BASE, `/highlights/${id}`, token, { method: 'PATCH', body: JSON.stringify({ color }) });
  },

  deleteHighlight(token: string, id: string) {
    return apiRequest<void>(BASE, `/highlights/${id}`, token, { method: 'DELETE' });
  },

  // Notes
  createNote(token: string, data: { bookId: string; chapterNumber: number; content: string; highlightId?: string }) {
    return apiRequest<ReaderNote>(BASE, '/notes', token, { method: 'POST', body: JSON.stringify(data) });
  },

  getNotes(token: string, bookId: string) {
    return fetchAllPages<ReaderNote>((page) =>
      apiRequest<ReaderNote[]>(BASE, `/notes/${bookId}?page=${page}&limit=${PAGE_SIZE}`, token),
    );
  },

  updateNote(token: string, id: string, content: string) {
    return apiRequest<ReaderNote>(BASE, `/notes/${id}`, token, { method: 'PATCH', body: JSON.stringify({ content }) });
  },

  deleteNote(token: string, id: string) {
    return apiRequest<void>(BASE, `/notes/${id}`, token, { method: 'DELETE' });
  },
};
