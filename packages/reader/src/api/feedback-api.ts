import { apiRequest } from './api-client';

const BASE = '/translations';

export interface TranslationFeedback {
  id: string;
  chapterId: string;
  startPosition: number;
  endPosition: number;
  selectedText: string;
  comment?: string | null;
  status: 'PENDING' | 'RETRANSLATING' | 'APPLIED' | 'REJECTED';
  reportCount: number;
  createdAt: string;
}

export interface FeedbackQuota {
  used: number;
  limit: number;
  remaining: number;
}

export interface ReportInput {
  chapterNumber: number;
  startPosition: number;
  endPosition: number;
  selectedText: string;
  comment?: string;
}

export const feedbackApi = {
  /** Report a passage that reads wrong; queues a re-translation of it. */
  report(token: string, translationId: string, data: ReportInput) {
    return apiRequest<TranslationFeedback>(BASE, `/${translationId}/feedback`, token, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getQuota(token: string, translationId: string) {
    return apiRequest<FeedbackQuota>(BASE, `/${translationId}/feedback/quota`, token);
  },

  list(token: string, translationId: string) {
    return apiRequest<TranslationFeedback[]>(BASE, `/${translationId}/feedback`, token);
  },
};
