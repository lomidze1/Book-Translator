import { apiRequest } from './api-client';

const BASE = '/tts';

export interface AudioChapterInfo {
  audioChapterId: string;
  chapterNumber: number;
  duration: number | null;
  fileSize: number | null;
  format: string;
  status: string;
}

export interface AudioBookStatus {
  id: string;
  status: string;
  progress: number;
  totalDuration: number | null;
  totalSize: number | null;
  totalChapters: number;
  completedChapters: number;
  chapters: AudioChapterInfo[];
}

export interface TtsVoice {
  id: string;
  name: string;
  language: string;
  gender: string;
  provider: string;
  previewUrl?: string;
}

export const ttsApi = {
  synthesizeBook(token: string, data: { bookId: string; voiceId?: string; speed?: number; provider?: string }) {
    return apiRequest<{ audioBookId: string; totalChapters: number; queued: number; status: string }>(
      BASE, '/synthesize-book', token, { method: 'POST', body: JSON.stringify(data) },
    );
  },

  synthesizeChapter(token: string, data: { bookId: string; chapterNumber: number; voiceId?: string; speed?: number }) {
    return apiRequest<{ audioBookId: string; audioChapterId: string; status: string; audioUrl?: string }>(
      BASE, '/synthesize', token, { method: 'POST', body: JSON.stringify(data) },
    );
  },

  getVoices(token: string) {
    return apiRequest<TtsVoice[]>(BASE, '/voices', token);
  },

  getStatus(token: string, audioBookId: string) {
    return apiRequest<AudioBookStatus>(BASE, `/status/${audioBookId}`, token);
  },

  getStreamUrl(token: string, audioChapterId: string) {
    return apiRequest<string>(BASE, `/stream/${audioChapterId}`, token);
  },

  getChapters(token: string, bookId: string) {
    return apiRequest<AudioChapterInfo[]>(BASE, `/chapters/${bookId}`, token);
  },

  getAudioUrl(token: string, bookId: string, chapterNumber: number) {
    return apiRequest<string | null>(BASE, `/audio/${bookId}/${chapterNumber}`, token);
  },

  deleteAudioBook(token: string, audioBookId: string) {
    return apiRequest<void>(BASE, `/audio/${audioBookId}`, token, { method: 'DELETE' });
  },
};
