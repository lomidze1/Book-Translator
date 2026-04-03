import { apiRequest } from './api-client';
import type { ReadingPosition, Bookmark, Highlight, ReaderNote } from '../types';

const BASE = '/reader';

export const readerApi = {
  // Progress
  saveProgress(token: string, data: { bookId: string; currentChapter: number; currentPosition: number; percentage: number }) {
    return apiRequest<ReadingPosition>(BASE, '/progress', token, { method: 'POST', body: JSON.stringify(data) });
  },

  getProgress(token: string, bookId: string) {
    return apiRequest<ReadingPosition | null>(BASE, `/progress/${bookId}`, token);
  },

  // Bookmarks
  createBookmark(token: string, data: { bookId: string; chapterNumber: number; position: number; label?: string }) {
    return apiRequest<Bookmark>(BASE, '/bookmarks', token, { method: 'POST', body: JSON.stringify(data) });
  },

  getBookmarks(token: string, bookId: string) {
    return apiRequest<Bookmark[]>(BASE, `/bookmarks/${bookId}`, token);
  },

  deleteBookmark(token: string, id: string) {
    return apiRequest<void>(BASE, `/bookmarks/${id}`, token, { method: 'DELETE' });
  },

  // Highlights
  createHighlight(token: string, data: { bookId: string; chapterNumber: number; startPosition: number; endPosition: number; selectedText: string; color?: string }) {
    return apiRequest<Highlight>(BASE, '/highlights', token, { method: 'POST', body: JSON.stringify(data) });
  },

  getHighlights(token: string, bookId: string) {
    return apiRequest<Highlight[]>(BASE, `/highlights/${bookId}`, token);
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
    return apiRequest<ReaderNote[]>(BASE, `/notes/${bookId}`, token);
  },

  updateNote(token: string, id: string, content: string) {
    return apiRequest<ReaderNote>(BASE, `/notes/${id}`, token, { method: 'PATCH', body: JSON.stringify({ content }) });
  },

  deleteNote(token: string, id: string) {
    return apiRequest<void>(BASE, `/notes/${id}`, token, { method: 'DELETE' });
  },
};
