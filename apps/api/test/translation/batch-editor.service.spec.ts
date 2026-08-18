import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchEditorService } from '../../src/translation/batch-editor.service';

describe('BatchEditorService', () => {
  let service: BatchEditorService;

  const mockPrisma = {
    translation: { findUnique: vi.fn(), update: vi.fn() },
    translatedChapter: { update: vi.fn() },
  };

  const mockClaude = {
    submitEditorBatch: vi.fn(),
    isBatchEnded: vi.fn(),
    getBatchResults: vi.fn(),
  };

  /** A STANDARD translation with one chapter split into two chunks. */
  const twoChunkTranslation = () => ({
    id: 'tr-1',
    translationType: 'STANDARD',
    styleGuide: 'ბრიფი',
    glossary: { John: 'ჯონი' },
    editorBatchId: null,
    book: { title: 'My Book' },
    translatedChapters: [
      {
        id: 'tc-1',
        chapterId: 'ch-1',
        translatedContent: 'ქართული ერთი.ქართული ორი.',
        segments: [
          { sourceStart: 0, sourceEnd: 10, start: 0, end: 13 },
          { sourceStart: 11, sourceEnd: 21, start: 13, end: 25 },
        ],
        chapter: { number: 1, originalContent: 'English 1.\nEnglish 2.' },
      },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.translation.update.mockResolvedValue({});
    mockPrisma.translatedChapter.update.mockResolvedValue({});
    service = new BatchEditorService(mockPrisma as any, mockClaude as any);
  });

  describe('submit', () => {
    it('should submit one request per chunk segment and store the batch id', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue(twoChunkTranslation());
      mockClaude.submitEditorBatch.mockResolvedValue('msgbatch_1');

      const batchId = await service.submit('tr-1');

      expect(batchId).toBe('msgbatch_1');
      const requests = mockClaude.submitEditorBatch.mock.calls[0][0];
      expect(requests).toHaveLength(2);
      expect(requests[0]).toMatchObject({
        customId: 'tc-1_0',
        source: 'English 1.',
        draft: 'ქართული ერთი.',
      });
      expect(requests[1]).toMatchObject({
        customId: 'tc-1_1',
        source: 'English 2.',
        draft: 'ქართული ორი.',
      });
      // Book context rides along so the editor applies the same brief
      expect(requests[0].options).toMatchObject({ bookTitle: 'My Book', styleGuide: 'ბრიფი' });

      expect(mockPrisma.translation.update).toHaveBeenCalledWith({
        where: { id: 'tr-1' },
        data: { editorBatchId: 'msgbatch_1', editorBatchStatus: 'SUBMITTED' },
      });
    });

    it('should skip FAST translations, which were already edited inline', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue({
        ...twoChunkTranslation(),
        translationType: 'FAST',
      });

      const batchId = await service.submit('tr-1');

      expect(batchId).toBeNull();
      expect(mockClaude.submitEditorBatch).not.toHaveBeenCalled();
    });

    it('should not submit twice for the same translation', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue({
        ...twoChunkTranslation(),
        editorBatchId: 'msgbatch_existing',
      });

      const batchId = await service.submit('tr-1');

      expect(batchId).toBeNull();
      expect(mockClaude.submitEditorBatch).not.toHaveBeenCalled();
    });

    it('should skip chapters with no recorded segments', async () => {
      const translation = twoChunkTranslation();
      translation.translatedChapters[0].segments = null as any;
      mockPrisma.translation.findUnique.mockResolvedValue(translation);

      const batchId = await service.submit('tr-1');

      expect(batchId).toBeNull();
      expect(mockClaude.submitEditorBatch).not.toHaveBeenCalled();
    });

    it('should skip segments whose ranges fall outside the stored text', async () => {
      const translation = twoChunkTranslation();
      translation.translatedChapters[0].segments = [
        { sourceStart: 0, sourceEnd: 10, start: 0, end: 13 },
        { sourceStart: 11, sourceEnd: 9999, start: 13, end: 9999 }, // stale
      ];
      mockPrisma.translation.findUnique.mockResolvedValue(translation);
      mockClaude.submitEditorBatch.mockResolvedValue('msgbatch_1');

      await service.submit('tr-1');

      const requests = mockClaude.submitEditorBatch.mock.calls[0][0];
      expect(requests).toHaveLength(1);
      expect(requests[0].customId).toBe('tc-1_0');
    });

    it('should return null when the translation is missing', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue(null);

      expect(await service.submit('tr-1')).toBeNull();
      expect(mockClaude.submitEditorBatch).not.toHaveBeenCalled();
    });
  });

  describe('poll', () => {
    const submitted = () => ({
      ...twoChunkTranslation(),
      editorBatchId: 'msgbatch_1',
      editorBatchStatus: 'SUBMITTED',
    });

    it('should report not-done while the batch is still processing', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue(submitted());
      mockClaude.isBatchEnded.mockResolvedValue(false);

      const result = await service.poll('tr-1');

      expect(result).toEqual({ done: false, applied: 0 });
      expect(mockPrisma.translatedChapter.update).not.toHaveBeenCalled();
    });

    it('should splice refined segments back into the chapter by custom id', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue(submitted());
      mockClaude.isBatchEnded.mockResolvedValue(true);
      // Deliberately out of order — results must be matched by id, not position
      mockClaude.getBatchResults.mockResolvedValue([
        { customId: 'tc-1_1', text: 'რედაქტირებული ორი.', tokensUsed: 100, ok: true },
        { customId: 'tc-1_0', text: 'რედაქტირებული ერთი.', tokensUsed: 100, ok: true },
      ]);

      const result = await service.poll('tr-1');

      expect(result).toEqual({ done: true, applied: 1 });
      expect(mockPrisma.translatedChapter.update).toHaveBeenCalledWith({
        where: { id: 'tc-1' },
        data: expect.objectContaining({
          translatedContent: 'რედაქტირებული ერთი.რედაქტირებული ორი.',
        }),
      });
      expect(mockPrisma.translation.update).toHaveBeenCalledWith({
        where: { id: 'tr-1' },
        data: expect.objectContaining({ editorBatchStatus: 'APPLIED' }),
      });
    });

    it('should shift later chunk boundaries by the splice delta and persist the segments', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue(submitted());
      mockClaude.isBatchEnded.mockResolvedValue(true);
      // 'რედაქტირებული ერთი.' is 19 chars vs the 13-char draft, so every
      // boundary after chunk 0 must move by +6 — stale offsets would make the
      // next editor pass or reader report address the wrong text.
      mockClaude.getBatchResults.mockResolvedValue([
        { customId: 'tc-1_0', text: 'რედაქტირებული ერთი.', tokensUsed: 100, ok: true },
        { customId: 'tc-1_1', text: 'რედაქტირებული ორი.', tokensUsed: 100, ok: true },
      ]);

      await service.poll('tr-1');

      expect(mockPrisma.translatedChapter.update).toHaveBeenCalledWith({
        where: { id: 'tc-1' },
        data: {
          translatedContent: 'რედაქტირებული ერთი.რედაქტირებული ორი.',
          segments: [
            { sourceStart: 0, sourceEnd: 10, start: 0, end: 19 },
            { sourceStart: 11, sourceEnd: 21, start: 19, end: 37 },
          ],
        },
      });
    });

    it('should keep the draft for segments that errored', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue(submitted());
      mockClaude.isBatchEnded.mockResolvedValue(true);
      mockClaude.getBatchResults.mockResolvedValue([
        { customId: 'tc-1_0', text: 'რედაქტირებული ერთი.', tokensUsed: 100, ok: true },
        { customId: 'tc-1_1', text: '', tokensUsed: 0, ok: false },
      ]);

      await service.poll('tr-1');

      expect(mockPrisma.translatedChapter.update).toHaveBeenCalledWith({
        where: { id: 'tc-1' },
        data: {
          translatedContent: 'რედაქტირებული ერთი.ქართული ორი.',
          segments: [
            { sourceStart: 0, sourceEnd: 10, start: 0, end: 19 },
            { sourceStart: 11, sourceEnd: 21, start: 19, end: 31 },
          ],
        },
      });
    });

    it('should keep the draft when a refined segment comes back suspiciously short', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue(submitted());
      mockClaude.isBatchEnded.mockResolvedValue(true);
      mockClaude.getBatchResults.mockResolvedValue([
        { customId: 'tc-1_0', text: 'ა', tokensUsed: 10, ok: true },
        { customId: 'tc-1_1', text: 'რედაქტირებული ორი.', tokensUsed: 100, ok: true },
      ]);

      await service.poll('tr-1');

      expect(mockPrisma.translatedChapter.update).toHaveBeenCalledWith({
        where: { id: 'tc-1' },
        data: {
          translatedContent: 'ქართული ერთი.რედაქტირებული ორი.',
          // Chunk 0 kept the draft, so only chunk 1's own end moves.
          segments: [
            { sourceStart: 0, sourceEnd: 10, start: 0, end: 13 },
            { sourceStart: 11, sourceEnd: 21, start: 13, end: 31 },
          ],
        },
      });
    });

    it('should not write the chapter when nothing usable came back', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue(submitted());
      mockClaude.isBatchEnded.mockResolvedValue(true);
      mockClaude.getBatchResults.mockResolvedValue([
        { customId: 'tc-1_0', text: '', tokensUsed: 0, ok: false },
        { customId: 'tc-1_1', text: '', tokensUsed: 0, ok: false },
      ]);

      const result = await service.poll('tr-1');

      expect(result).toEqual({ done: true, applied: 0 });
      expect(mockPrisma.translatedChapter.update).not.toHaveBeenCalled();
      expect(mockPrisma.translation.update).toHaveBeenCalledWith({
        where: { id: 'tr-1' },
        data: expect.objectContaining({ editorBatchStatus: 'APPLIED' }),
      });
    });

    it('should report done when there is no batch to poll', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue({
        ...twoChunkTranslation(),
        editorBatchId: null,
      });

      const result = await service.poll('tr-1');

      expect(result).toEqual({ done: true, applied: 0 });
      expect(mockClaude.isBatchEnded).not.toHaveBeenCalled();
    });
  });
});
