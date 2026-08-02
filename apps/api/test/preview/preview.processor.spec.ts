import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PreviewProcessor } from '../../src/preview/preview.processor';
import { PREVIEW_MAX_CHARS } from '../../src/preview/preview.constants';

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn(), close: vi.fn() })),
}));

describe('PreviewProcessor', () => {
  let processor: PreviewProcessor;

  const mockPrisma = {
    bookPreview: { findUnique: vi.fn(), update: vi.fn() },
    book: { findUnique: vi.fn() },
    chapter: { findFirst: vi.fn() },
  };

  const mockClaude = {
    translateChapter: vi.fn(),
    getModel: vi.fn().mockReturnValue('claude-sonnet-5'),
  };

  const mockTranslationService = { parseAndSaveChapters: vi.fn() };
  const mockConfig = { get: vi.fn().mockReturnValue(undefined) };

  const job = (overrides = {}) => ({
    data: { previewId: 'pv-1', bookId: 'book-1', targetLanguage: 'ka', ...overrides },
  });

  const run = (j: any = job()) => (processor as any).processPreview(j);

  const bookWithChapters = {
    id: 'book-1',
    title: 'Test Book',
    originalFileUrl: 's3://key',
    originalFormat: 'PDF',
    _count: { chapters: 3 },
  };

  /** ~1200 words of prose, long enough to trigger truncation. */
  const longChapter = Array.from({ length: 1200 }, (_, i) =>
    `lorem${(i + 1) % 12 === 0 ? '.' : ''}`,
  ).join(' ');

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.bookPreview.findUnique.mockResolvedValue({ id: 'pv-1', status: 'PENDING' });
    mockPrisma.bookPreview.update.mockResolvedValue({});
    mockPrisma.book.findUnique.mockResolvedValue(bookWithChapters);
    mockPrisma.chapter.findFirst.mockResolvedValue({
      id: 'ch-1',
      number: 1,
      originalContent: longChapter,
    });
    mockClaude.translateChapter.mockResolvedValue({
      translatedText: 'ქართული თარგმანი',
      tokensUsed: 4200,
    });
    processor = new PreviewProcessor(
      mockPrisma as any,
      mockClaude as any,
      mockTranslationService as any,
      mockConfig as any,
    );
  });

  describe('happy path', () => {
    it('translates once, with no editor pass, and persists the result', async () => {
      await run();

      expect(mockClaude.translateChapter).toHaveBeenCalledTimes(1);
      const [text, options] = mockClaude.translateChapter.mock.calls[0];
      // A preview must never read better than the tier the user goes on to buy.
      expect(options.editorPass).toBe(false);
      expect(options.onChunkComplete).toBeUndefined();
      // Guarantees a single Claude call.
      expect(text.length).toBeLessThanOrEqual(PREVIEW_MAX_CHARS);

      expect(mockPrisma.bookPreview.update).toHaveBeenLastCalledWith({
        where: { id: 'pv-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          content: 'ქართული თარგმანი',
          tokensUsed: 4200,
          aiModel: 'claude-sonnet-5',
          chapterNumber: 1,
          editorPass: false,
        }),
      });
    });

    it('marks the row IN_PROGRESS before calling Claude', async () => {
      await run();

      expect(mockPrisma.bookPreview.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'pv-1' },
        data: expect.objectContaining({ status: 'IN_PROGRESS' }),
      });
    });
  });

  describe('chapter preparation', () => {
    it('parses chapters when the book has none yet', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({
        ...bookWithChapters,
        _count: { chapters: 0 },
      });

      await run();

      expect(mockTranslationService.parseAndSaveChapters).toHaveBeenCalledWith(
        'book-1',
        's3://key',
        'PDF',
      );
    });

    it('skips parsing when chapters already exist', async () => {
      await run();

      expect(mockTranslationService.parseAndSaveChapters).not.toHaveBeenCalled();
    });

    it('prefers a substantial chapter over parsed front matter', async () => {
      await run();

      // First query filters on the minimum word count; only if that misses do
      // we fall back to "whatever chapter 1 is".
      expect(mockPrisma.chapter.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ wordCount: expect.objectContaining({ gte: 300 }) }),
          orderBy: { number: 'asc' },
        }),
      );
    });

    it('falls back to the first chapter when every chapter is short', async () => {
      mockPrisma.chapter.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'ch-1', number: 1, originalContent: longChapter });

      await run();

      expect(mockPrisma.chapter.findFirst).toHaveBeenCalledTimes(2);
      expect(mockClaude.translateChapter).toHaveBeenCalledTimes(1);
    });
  });

  describe('failure handling', () => {
    it('marks the row FAILED and leaves content null when Claude throws', async () => {
      mockClaude.translateChapter.mockRejectedValue(new Error('rate limited'));

      await expect(run()).rejects.toThrow('rate limited');

      expect(mockPrisma.bookPreview.update).toHaveBeenLastCalledWith({
        where: { id: 'pv-1' },
        data: { status: 'FAILED', errorMessage: 'rate limited' },
      });
      const wroteContent = mockPrisma.bookPreview.update.mock.calls.some(
        ([arg]: any[]) => arg.data.content,
      );
      expect(wroteContent).toBe(false);
    });

    it('fails without calling Claude when the book has no chapters', async () => {
      mockPrisma.chapter.findFirst.mockResolvedValue(null);

      await expect(run()).rejects.toThrow(/no readable chapters/i);
      expect(mockClaude.translateChapter).not.toHaveBeenCalled();
    });

    it('fails without calling Claude when an unparsed book has no file', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({
        ...bookWithChapters,
        originalFileUrl: null,
        _count: { chapters: 0 },
      });

      await expect(run()).rejects.toThrow(/not available/i);
      expect(mockClaude.translateChapter).not.toHaveBeenCalled();
    });
  });

  describe('replay safety', () => {
    it('does not re-spend tokens on an already COMPLETED preview', async () => {
      mockPrisma.bookPreview.findUnique.mockResolvedValue({ id: 'pv-1', status: 'COMPLETED' });

      await run();

      expect(mockClaude.translateChapter).not.toHaveBeenCalled();
      expect(mockPrisma.bookPreview.update).not.toHaveBeenCalled();
    });

    it('no-ops when the preview row has been deleted', async () => {
      mockPrisma.bookPreview.findUnique.mockResolvedValue(null);

      await run();

      expect(mockClaude.translateChapter).not.toHaveBeenCalled();
    });
  });
});
