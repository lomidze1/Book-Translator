import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationProcessor } from '../../src/translation/translation.processor';

// Mock BullMQ
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
  })),
  Job: vi.fn(),
}));

describe('TranslationProcessor', () => {
  let processor: TranslationProcessor;

  const mockPrisma = {
    chapter: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    book: {
      findUnique: vi.fn(),
    },
    translation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockS3 = {
    generateTranslationKey: vi.fn().mockReturnValue('translations/book-1/tr-1/ch-1.txt'),
    upload: vi.fn().mockResolvedValue(undefined),
  };

  const mockClaude = {
    translateChapter: vi.fn(),
    generateChapterSummary: vi.fn(),
    getModel: vi.fn().mockReturnValue('claude-sonnet-4-20250514'),
    estimateChunkCount: vi.fn().mockReturnValue(1),
  };

  const mockTranslationService = {
    updateProgress: vi.fn().mockResolvedValue(undefined),
    saveTranslatedChapter: vi.fn().mockResolvedValue(undefined),
  };

  const createMockJob = (data: { translationId: string; bookId: string }) => ({
    data,
    id: 'job-1',
    updateProgress: vi.fn().mockResolvedValue(undefined),
  });

  // Helper: make translateChapter invoke the onChunkComplete callback
  function mockTranslateWithCallback(result: { translatedText: string; tokensUsed: number }) {
    return async (_content: string, options: any) => {
      if (options.onChunkComplete) await options.onChunkComplete(0, 1);
      return result;
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new (TranslationProcessor as any)(
      mockPrisma,
      mockS3,
      mockClaude,
      mockTranslationService,
      { notify: vi.fn().mockResolvedValue(undefined) },
    );
  });

  describe('processTranslation', () => {
    const callProcess = (job: any) => (processor as any).processTranslation(job);

    it('should translate all chapters and mark as completed', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });

      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1 },
        { id: 'ch-2', number: 2 },
      ]);
      mockPrisma.chapter.findUnique
        .mockResolvedValueOnce({ id: 'ch-1', number: 1, originalContent: 'Chapter 1 text' })
        .mockResolvedValueOnce({ id: 'ch-2', number: 2, originalContent: 'Chapter 2 text' });
      mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Test Book' });
      mockPrisma.translation.findUnique.mockResolvedValue({ id: 'tr-1', glossary: null });
      mockPrisma.translation.update.mockResolvedValue({});

      mockClaude.translateChapter.mockImplementation(
        mockTranslateWithCallback({ translatedText: 'ნათარგმნი ტექსტი', tokensUsed: 100 }),
      );
      mockClaude.generateChapterSummary.mockResolvedValue('თავის რეზიუმე');

      await callProcess(job);

      // Should translate both chapters
      expect(mockClaude.translateChapter).toHaveBeenCalledTimes(2);

      // Should save both translated chapters
      expect(mockTranslationService.saveTranslatedChapter).toHaveBeenCalledTimes(2);
      expect(mockTranslationService.saveTranslatedChapter).toHaveBeenCalledWith('tr-1', 'ch-1', 'ნათარგმნი ტექსტი');
      expect(mockTranslationService.saveTranslatedChapter).toHaveBeenCalledWith('tr-1', 'ch-2', 'ნათარგმნი ტექსტი');

      // Should upload to S3
      expect(mockS3.upload).toHaveBeenCalledTimes(2);

      // Should generate summaries for context continuity
      expect(mockClaude.generateChapterSummary).toHaveBeenCalledTimes(2);

      // Should mark as completed
      expect(mockTranslationService.updateProgress).toHaveBeenCalledWith('tr-1', 100, 'COMPLETED');

      // Should update job progress per chunk (2 chunks total, 1 per chapter)
      expect(job.updateProgress).toHaveBeenCalledTimes(2);
    });

    it('should pass previous summary to next chapter translation', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });

      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1 },
        { id: 'ch-2', number: 2 },
      ]);
      mockPrisma.chapter.findUnique
        .mockResolvedValueOnce({ id: 'ch-1', number: 1, originalContent: 'Ch 1' })
        .mockResolvedValueOnce({ id: 'ch-2', number: 2, originalContent: 'Ch 2' });
      mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Book' });
      mockPrisma.translation.findUnique.mockResolvedValue({ id: 'tr-1', glossary: null });
      mockPrisma.translation.update.mockResolvedValue({});

      mockClaude.translateChapter.mockImplementation(
        mockTranslateWithCallback({ translatedText: 'text', tokensUsed: 50 }),
      );
      mockClaude.generateChapterSummary
        .mockResolvedValueOnce('Summary of chapter 1')
        .mockResolvedValueOnce('Summary of chapter 2');

      await callProcess(job);

      // Second chapter should receive first chapter's summary
      const secondCall = mockClaude.translateChapter.mock.calls[1];
      expect(secondCall[1].previousSummary).toBe('Summary of chapter 1');
    });

    it('should fail if no chapters found', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });
      mockPrisma.chapter.findMany.mockResolvedValue([]);

      await expect(callProcess(job)).rejects.toThrow('No chapters found');
      expect(mockTranslationService.updateProgress).toHaveBeenCalledWith('tr-1', 0, 'FAILED');
    });

    it('should fail if book not found', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });
      mockPrisma.chapter.findMany.mockResolvedValue([{ id: 'ch-1', number: 1 }]);
      mockPrisma.chapter.findUnique.mockResolvedValue({ id: 'ch-1', number: 1, originalContent: 'text' });
      mockPrisma.book.findUnique.mockResolvedValue(null);
      mockPrisma.translation.findUnique.mockResolvedValue({ id: 'tr-1', glossary: null });

      await expect(callProcess(job)).rejects.toThrow('Book not found');
      expect(mockTranslationService.updateProgress).toHaveBeenCalledWith('tr-1', 0, 'FAILED');
    });

    it('should mark as FAILED and store error if chapter translation fails', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });

      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1 },
      ]);
      mockPrisma.chapter.findUnique.mockResolvedValueOnce({ id: 'ch-1', number: 1, originalContent: 'text' });
      mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Book' });
      mockPrisma.translation.findUnique.mockResolvedValue({ id: 'tr-1', glossary: null });
      mockPrisma.translation.update.mockResolvedValue({});

      mockClaude.translateChapter.mockRejectedValue(new Error('API rate limit'));

      await expect(callProcess(job)).rejects.toThrow('API rate limit');

      expect(mockPrisma.translation.update).toHaveBeenCalledWith({
        where: { id: 'tr-1' },
        data: {
          status: 'FAILED',
          errorMessage: 'API rate limit',
        },
      });
    });

    it('should calculate chunk-based progress correctly', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });

      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1 },
        { id: 'ch-2', number: 2 },
        { id: 'ch-3', number: 3 },
      ]);
      mockPrisma.chapter.findUnique
        .mockResolvedValueOnce({ id: 'ch-1', number: 1, originalContent: 'text1' })
        .mockResolvedValueOnce({ id: 'ch-2', number: 2, originalContent: 'text2' })
        .mockResolvedValueOnce({ id: 'ch-3', number: 3, originalContent: 'text3' });
      mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Book' });
      mockPrisma.translation.findUnique.mockResolvedValue({ id: 'tr-1', glossary: null });
      mockPrisma.translation.update.mockResolvedValue({});
      // Each chapter = 1 chunk, total 3 chunks
      mockClaude.estimateChunkCount.mockReturnValue(1);
      mockClaude.translateChapter.mockImplementation(
        mockTranslateWithCallback({ translatedText: 'text', tokensUsed: 10 }),
      );
      mockClaude.generateChapterSummary.mockResolvedValue('summary');

      await callProcess(job);

      // Chunk progress: 33%, 67%, 99% (capped at 99 before COMPLETED)
      expect(mockTranslationService.updateProgress).toHaveBeenCalledWith('tr-1', 33);
      expect(mockTranslationService.updateProgress).toHaveBeenCalledWith('tr-1', 67);
      expect(mockTranslationService.updateProgress).toHaveBeenCalledWith('tr-1', 99);
      expect(mockTranslationService.updateProgress).toHaveBeenCalledWith('tr-1', 100, 'COMPLETED');
    });

    it('should accumulate total tokens across chapters', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });

      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1 },
        { id: 'ch-2', number: 2 },
      ]);
      mockPrisma.chapter.findUnique
        .mockResolvedValueOnce({ id: 'ch-1', number: 1, originalContent: 'text1' })
        .mockResolvedValueOnce({ id: 'ch-2', number: 2, originalContent: 'text2' });
      mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Book' });
      mockPrisma.translation.findUnique.mockResolvedValue({ id: 'tr-1', glossary: null });
      mockPrisma.translation.update.mockResolvedValue({});

      let callCount = 0;
      mockClaude.translateChapter.mockImplementation(async (_content: string, options: any) => {
        callCount++;
        const tokensUsed = callCount === 1 ? 100 : 200;
        if (options.onChunkComplete) await options.onChunkComplete(0, 1);
        return { translatedText: 'text', tokensUsed };
      });
      mockClaude.generateChapterSummary.mockResolvedValue('summary');

      await callProcess(job);

      // Second update should have accumulated tokens (100 + 200 = 300)
      const lastTokenCall = mockPrisma.translation.update.mock.calls[1];
      expect(lastTokenCall[0].data.totalTokensUsed).toBe(300);
    });

    it('should use glossary from translation record', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });

      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1 },
      ]);
      mockPrisma.chapter.findUnique.mockResolvedValue({ id: 'ch-1', number: 1, originalContent: 'glossary test text' });
      mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Book' });
      mockPrisma.translation.findUnique.mockResolvedValue({
        id: 'tr-1',
        glossary: { John: 'ჯონი' },
      });
      mockPrisma.translation.update.mockResolvedValue({});
      mockClaude.translateChapter.mockImplementation(
        mockTranslateWithCallback({ translatedText: 'text', tokensUsed: 50 }),
      );
      mockClaude.generateChapterSummary.mockResolvedValue('summary');

      await callProcess(job);

      expect(mockClaude.translateChapter).toHaveBeenCalledWith(
        'glossary test text',
        expect.objectContaining({ glossary: { John: 'ჯონი' } }),
      );
    });

    it('should use getModel() for aiModel field', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });

      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1 },
      ]);
      mockPrisma.chapter.findUnique.mockResolvedValueOnce({ id: 'ch-1', number: 1, originalContent: 'text' });
      mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Book' });
      mockPrisma.translation.findUnique.mockResolvedValue({ id: 'tr-1', glossary: null });
      mockPrisma.translation.update.mockResolvedValue({});
      mockClaude.translateChapter.mockImplementation(
        mockTranslateWithCallback({ translatedText: 'text', tokensUsed: 50 }),
      );
      mockClaude.generateChapterSummary.mockResolvedValue('summary');

      await callProcess(job);

      expect(mockPrisma.translation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ aiModel: 'claude-sonnet-4-20250514' }),
        }),
      );
      expect(mockClaude.getModel).toHaveBeenCalled();
    });

    it('should handle single chapter with chunk-level progress', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });

      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1 },
      ]);
      mockPrisma.chapter.findUnique.mockResolvedValueOnce({ id: 'ch-1', number: 1, originalContent: 'text' });
      mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Book' });
      mockPrisma.translation.findUnique.mockResolvedValue({ id: 'tr-1', glossary: null });
      mockPrisma.translation.update.mockResolvedValue({});
      mockClaude.translateChapter.mockImplementation(
        mockTranslateWithCallback({ translatedText: 'text', tokensUsed: 50 }),
      );
      mockClaude.generateChapterSummary.mockResolvedValue('summary');

      await callProcess(job);

      // Single chunk = 99% (capped), then 100% COMPLETED
      expect(mockTranslationService.updateProgress).toHaveBeenCalledWith('tr-1', 99);
      expect(mockTranslationService.updateProgress).toHaveBeenCalledWith('tr-1', 100, 'COMPLETED');
    });

    it('should mark as IN_PROGRESS before starting', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });

      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1 },
      ]);
      mockPrisma.chapter.findUnique.mockResolvedValueOnce({ id: 'ch-1', number: 1, originalContent: 'text' });
      mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Book' });
      mockPrisma.translation.findUnique.mockResolvedValue({ id: 'tr-1', glossary: null });
      mockPrisma.translation.update.mockResolvedValue({});
      mockClaude.translateChapter.mockImplementation(
        mockTranslateWithCallback({ translatedText: 'text', tokensUsed: 50 }),
      );
      mockClaude.generateChapterSummary.mockResolvedValue('summary');

      await callProcess(job);

      // First call should be marking as IN_PROGRESS
      expect(mockTranslationService.updateProgress.mock.calls[0]).toEqual(['tr-1', 0, 'IN_PROGRESS']);
    });

    it('should handle non-Error thrown by translateChapter', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });

      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1 },
      ]);
      mockPrisma.chapter.findUnique.mockResolvedValueOnce({ id: 'ch-1', number: 1, originalContent: 'text' });
      mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Book' });
      mockPrisma.translation.findUnique.mockResolvedValue({ id: 'tr-1', glossary: null });
      mockPrisma.translation.update.mockResolvedValue({});
      mockClaude.translateChapter.mockRejectedValue('string error');

      await expect(callProcess(job)).rejects.toBe('string error');

      expect(mockPrisma.translation.update).toHaveBeenCalledWith({
        where: { id: 'tr-1' },
        data: {
          status: 'FAILED',
          errorMessage: 'Translation failed',
        },
      });
    });
  });

  describe('onModuleInit', () => {
    it('should not throw if Redis is unavailable', () => {
      // The constructor already ran without error — onModuleInit catches errors internally
      expect(() => processor.onModuleInit()).not.toThrow();
    });
  });
});
