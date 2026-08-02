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
    extractGlossaryTerms: vi.fn().mockResolvedValue({ glossary: {}, tokensUsed: 0 }),
    getModel: vi.fn().mockReturnValue('claude-sonnet-5'),
    estimateChunkCount: vi.fn().mockReturnValue(1),
  };

  const mockTranslationService = {
    updateProgress: vi.fn().mockResolvedValue(undefined),
    saveTranslatedChapter: vi.fn().mockResolvedValue(undefined),
  };

  const cleanReport = {
    flags: [],
    latinRatio: 0,
    latinSamples: [],
    missingNumbers: [],
    extraNumbers: [],
    sourceParagraphs: 1,
    translatedParagraphs: 1,
    repeatedParagraphs: 0,
  };

  const mockQualityCheck = {
    checkChapter: vi.fn().mockReturnValue(cleanReport),
    summarize: vi.fn().mockReturnValue({ chaptersChecked: 1, chaptersFlagged: 0, flagCounts: {} }),
  };

  const mockGeminiJudge = {
    isEnabled: vi.fn().mockReturnValue(false),
    judgeSample: vi.fn().mockResolvedValue(null),
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
    mockQualityCheck.checkChapter.mockReturnValue(cleanReport);
    mockQualityCheck.summarize.mockReturnValue({ chaptersChecked: 1, chaptersFlagged: 0, flagCounts: {} });
    mockGeminiJudge.isEnabled.mockReturnValue(false);
    mockGeminiJudge.judgeSample.mockResolvedValue(null);
    processor = new (TranslationProcessor as any)(
      mockPrisma,
      mockS3,
      mockClaude,
      mockTranslationService,
      { notify: vi.fn().mockResolvedValue(undefined) },
      mockQualityCheck,
      mockGeminiJudge,
    );
  });

  describe('processTranslation', () => {
    const callProcess = (job: any) => (processor as any).processTranslation(job);

    it('should translate all chapters and mark as completed', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });

      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1, originalContent: 'Chapter 1 text' },
        { id: 'ch-2', number: 2, originalContent: 'Chapter 2 text' },
      ]);
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
      expect(mockTranslationService.saveTranslatedChapter).toHaveBeenCalledWith('tr-1', 'ch-1', 'ნათარგმნი ტექსტი', cleanReport);
      expect(mockTranslationService.saveTranslatedChapter).toHaveBeenCalledWith('tr-1', 'ch-2', 'ნათარგმნი ტექსტი', cleanReport);

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
        { id: 'ch-1', number: 1, originalContent: 'Ch 1' },
        { id: 'ch-2', number: 2, originalContent: 'Ch 2' },
      ]);
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
      mockPrisma.chapter.findMany.mockResolvedValue([{ id: 'ch-1', number: 1, originalContent: 'text' }]);
      mockPrisma.book.findUnique.mockResolvedValue(null);
      mockPrisma.translation.findUnique.mockResolvedValue({ id: 'tr-1', glossary: null });

      await expect(callProcess(job)).rejects.toThrow('Book not found');
      expect(mockTranslationService.updateProgress).toHaveBeenCalledWith('tr-1', 0, 'FAILED');
    });

    it('should mark as FAILED and store error if chapter translation fails', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });

      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1, originalContent: 'text' },
      ]);
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
        { id: 'ch-1', number: 1, originalContent: 'text1' },
        { id: 'ch-2', number: 2, originalContent: 'text2' },
        { id: 'ch-3', number: 3, originalContent: 'text3' },
      ]);
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
        { id: 'ch-1', number: 1, originalContent: 'text1' },
        { id: 'ch-2', number: 2, originalContent: 'text2' },
      ]);
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
        { id: 'ch-1', number: 1, originalContent: 'glossary test text' },
      ]);
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

    it('should merge extracted glossary terms and persist them', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });

      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1, originalContent: 'John met Mary in London.' },
      ]);
      mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Book' });
      mockPrisma.translation.findUnique.mockResolvedValue({
        id: 'tr-1',
        glossary: { John: 'ჯონი' },
      });
      mockPrisma.translation.update.mockResolvedValue({});
      mockClaude.extractGlossaryTerms.mockResolvedValue({
        glossary: { Mary: 'მერი' },
        tokensUsed: 100,
      });
      mockClaude.translateChapter.mockImplementation(
        mockTranslateWithCallback({ translatedText: 'text', tokensUsed: 50 }),
      );
      mockClaude.generateChapterSummary.mockResolvedValue('summary');

      await callProcess(job);

      // NOTE: the processor mutates the same glossary object it passed in, so
      // the recorded argument reflects the post-merge state — assert loosely.
      expect(mockClaude.extractGlossaryTerms).toHaveBeenCalledWith(
        'John met Mary in London.',
        expect.objectContaining({ John: 'ჯონი' }),
      );
      expect(mockClaude.translateChapter).toHaveBeenCalledWith(
        'John met Mary in London.',
        expect.objectContaining({ glossary: { John: 'ჯონი', Mary: 'მერი' } }),
      );
      expect(mockPrisma.translation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ glossary: { John: 'ჯონი', Mary: 'მერი' } }),
        }),
      );
    });

    it('should enable editorPass for FAST (premium) translations only', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });

      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1, originalContent: 'text' },
      ]);
      mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Book' });
      mockPrisma.translation.findUnique.mockResolvedValue({
        id: 'tr-1',
        glossary: null,
        translationType: 'FAST',
      });
      mockPrisma.translation.update.mockResolvedValue({});
      mockClaude.translateChapter.mockImplementation(
        mockTranslateWithCallback({ translatedText: 'text', tokensUsed: 50 }),
      );
      mockClaude.generateChapterSummary.mockResolvedValue('summary');

      await callProcess(job);

      expect(mockClaude.translateChapter).toHaveBeenCalledWith(
        'text',
        expect.objectContaining({ editorPass: true }),
      );

      // STANDARD tier: single pass
      vi.clearAllMocks();
      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1, originalContent: 'text' },
      ]);
      mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Book' });
      mockPrisma.translation.findUnique.mockResolvedValue({
        id: 'tr-1',
        glossary: null,
        translationType: 'STANDARD',
      });
      mockPrisma.translation.update.mockResolvedValue({});
      mockClaude.extractGlossaryTerms.mockResolvedValue({ glossary: {}, tokensUsed: 0 });
      mockClaude.translateChapter.mockImplementation(
        mockTranslateWithCallback({ translatedText: 'text', tokensUsed: 50 }),
      );
      mockClaude.generateChapterSummary.mockResolvedValue('summary');
      mockClaude.estimateChunkCount.mockReturnValue(1);

      await callProcess(job);

      expect(mockClaude.translateChapter).toHaveBeenCalledWith(
        'text',
        expect.objectContaining({ editorPass: false }),
      );
    });

    it('should use getModel() for aiModel field', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });

      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1, originalContent: 'text' },
      ]);
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
          data: expect.objectContaining({ aiModel: 'claude-sonnet-5' }),
        }),
      );
      expect(mockClaude.getModel).toHaveBeenCalled();
    });

    it('should handle single chapter with chunk-level progress', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });

      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1, originalContent: 'text' },
      ]);
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
        { id: 'ch-1', number: 1, originalContent: 'text' },
      ]);
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
        { id: 'ch-1', number: 1, originalContent: 'text' },
      ]);
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

  describe('quality pipeline', () => {
    const callProcess = (job: any) => (processor as any).processTranslation(job);

    const setupTwoChapters = () => {
      mockPrisma.chapter.findMany.mockResolvedValue([
        { id: 'ch-1', number: 1, originalContent: 'Source one text here.' },
        { id: 'ch-2', number: 2, originalContent: 'Source two text here.' },
      ]);
      mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Book' });
      mockPrisma.translation.findUnique.mockResolvedValue({ id: 'tr-1', glossary: null });
      mockPrisma.translation.update.mockResolvedValue({});
      mockClaude.translateChapter.mockImplementation(
        mockTranslateWithCallback({ translatedText: 'ნათარგმნი ტექსტი', tokensUsed: 10 }),
      );
      mockClaude.generateChapterSummary.mockResolvedValue('summary');
      mockClaude.estimateChunkCount.mockReturnValue(1);
    };

    it('should run mechanical checks on every chapter with source and translation', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });
      setupTwoChapters();

      await callProcess(job);

      expect(mockQualityCheck.checkChapter).toHaveBeenCalledTimes(2);
      expect(mockQualityCheck.checkChapter).toHaveBeenCalledWith('Source one text here.', 'ნათარგმნი ტექსტი');
      expect(mockQualityCheck.checkChapter).toHaveBeenCalledWith('Source two text here.', 'ნათარგმნი ტექსტი');
    });

    it('should store the mechanical summary in the translation qualityReport', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });
      setupTwoChapters();
      const summary = { chaptersChecked: 2, chaptersFlagged: 1, flagCounts: { LATIN_LEAKAGE: 1 } };
      mockQualityCheck.summarize.mockReturnValue(summary);

      await callProcess(job);

      expect(mockPrisma.translation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tr-1' },
          data: expect.objectContaining({
            qualityReport: expect.objectContaining({ mechanical: summary }),
          }),
        }),
      );
      // Judge disabled → no qualityScore written
      const qualityCall = mockPrisma.translation.update.mock.calls.find(
        (call) => call[0].data.qualityReport,
      );
      expect(qualityCall[0].data.qualityScore).toBeUndefined();
    });

    it('should judge samples and store the average as qualityScore when enabled', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });
      setupTwoChapters();
      mockGeminiJudge.isEnabled.mockReturnValue(true);
      mockGeminiJudge.judgeSample
        .mockResolvedValueOnce({ accuracy: 4, fluency: 5, consistency: 4, overall: 4, issues: [] })
        .mockResolvedValueOnce({ accuracy: 5, fluency: 5, consistency: 5, overall: 5, issues: [] });

      await callProcess(job);

      expect(mockGeminiJudge.judgeSample).toHaveBeenCalledTimes(2);
      expect(mockPrisma.translation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tr-1' },
          data: expect.objectContaining({
            qualityScore: 4.5,
            qualityReport: expect.objectContaining({
              judge: expect.objectContaining({
                averages: expect.objectContaining({ overall: 4.5 }),
              }),
            }),
          }),
        }),
      );
    });

    it('should complete the translation even if judging fails entirely', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });
      setupTwoChapters();
      mockGeminiJudge.isEnabled.mockReturnValue(true);
      mockGeminiJudge.judgeSample.mockResolvedValue(null); // every sample fails

      await callProcess(job);

      expect(mockTranslationService.updateProgress).toHaveBeenCalledWith('tr-1', 100, 'COMPLETED');
      const qualityCall = mockPrisma.translation.update.mock.calls.find(
        (call) => call[0].data.qualityReport,
      );
      expect(qualityCall[0].data.qualityScore).toBeUndefined();
    });

    it('should sample at most 3 chapters (first, middle, last) for judging', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });
      mockPrisma.chapter.findMany.mockResolvedValue(
        Array.from({ length: 7 }, (_, i) => ({
          id: `ch-${i + 1}`,
          number: i + 1,
          originalContent: `Source chapter ${i + 1}.`,
        })),
      );
      mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Book' });
      mockPrisma.translation.findUnique.mockResolvedValue({ id: 'tr-1', glossary: null });
      mockPrisma.translation.update.mockResolvedValue({});
      mockClaude.translateChapter.mockImplementation(
        mockTranslateWithCallback({ translatedText: 'ტექსტი', tokensUsed: 10 }),
      );
      mockClaude.generateChapterSummary.mockResolvedValue('summary');
      mockGeminiJudge.isEnabled.mockReturnValue(true);
      mockGeminiJudge.judgeSample.mockResolvedValue({
        accuracy: 4, fluency: 4, consistency: 4, overall: 4, issues: [],
      });

      await callProcess(job);

      expect(mockGeminiJudge.judgeSample).toHaveBeenCalledTimes(3);
      // First chapter's source is among the judged samples
      expect(mockGeminiJudge.judgeSample).toHaveBeenCalledWith(
        expect.stringContaining('Source chapter 1.'),
        expect.any(String),
      );
      // Last chapter too
      expect(mockGeminiJudge.judgeSample).toHaveBeenCalledWith(
        expect.stringContaining('Source chapter 7.'),
        expect.any(String),
      );
    });

    it('should not fail the translation if the quality step itself throws', async () => {
      const job = createMockJob({ translationId: 'tr-1', bookId: 'book-1' });
      setupTwoChapters();
      mockQualityCheck.summarize.mockImplementation(() => {
        throw new Error('summarize exploded');
      });

      await callProcess(job);

      expect(mockTranslationService.updateProgress).toHaveBeenCalledWith('tr-1', 100, 'COMPLETED');
    });
  });

  describe('onModuleInit', () => {
    it('should not throw if Redis is unavailable', () => {
      // The constructor already ran without error — onModuleInit catches errors internally
      expect(() => processor.onModuleInit()).not.toThrow();
    });
  });
});
