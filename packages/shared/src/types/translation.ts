export type TranslationStatus = 'PENDING' | 'PAID' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface Translation {
  id: string;
  bookId: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: TranslationStatus;
  progress: number;
  aiModel: string | null;
  tokensUsed: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TranslatedChapter {
  id: string;
  translationId: string;
  chapterId: string;
  translatedContent: string;
  editedContent: string | null;
  isEdited: boolean;
  createdAt: Date;
}
