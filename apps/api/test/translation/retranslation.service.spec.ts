import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetranslationService } from '../../src/translation/retranslation.service';

describe('RetranslationService', () => {
  let service: RetranslationService;

  const mockPrisma = {
    translationFeedback: { findUnique: vi.fn(), update: vi.fn() },
    translatedChapter: { findFirst: vi.fn(), update: vi.fn() },
  };

  const mockClaude = { retranslateWithFeedback: vi.fn() };

  // Chapter of two chunks; the reader flagged something in the SECOND one.
  const feedback = () => ({
    id: 'fb-1',
    translationId: 'tr-1',
    chapterId: 'ch-1',
    startPosition: 21,
    endPosition: 25,
    selectedText: 'ცუდი',
    comment: 'კალკია',
    status: 'PENDING',
    translation: {
      id: 'tr-1',
      glossary: { John: 'ჯონი' },
      styleGuide: 'ბრიფი',
      book: { title: 'My Book' },
      translatedChapters: [{ chapterId: 'ch-1' }, { chapterId: 'ch-2' }],
    },
    chapter: { number: 2, originalContent: 'First source part. Second source part.' },
  });

  const translatedChapter = () => ({
    id: 'tc-1',
    translatedContent: 'პირველი ნაწილი.მეორე ცუდი ნაწილი.',
    segments: [
      { sourceStart: 0, sourceEnd: 18, start: 0, end: 15 },
      { sourceStart: 19, sourceEnd: 38, start: 15, end: 33 },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.translationFeedback.findUnique.mockResolvedValue(feedback());
    mockPrisma.translatedChapter.findFirst.mockResolvedValue(translatedChapter());
    mockPrisma.translationFeedback.update.mockResolvedValue({});
    mockPrisma.translatedChapter.update.mockResolvedValue({});
    mockClaude.retranslateWithFeedback.mockResolvedValue({
      translatedText: 'მეორე გამართული ნაწილი.',
      tokensUsed: 300,
    });
    service = new RetranslationService(mockPrisma as any, mockClaude as any);
  });

  it('should re-translate only the chunk containing the flagged range', async () => {
    await service.retranslate('fb-1');

    const [source, draft] = mockClaude.retranslateWithFeedback.mock.calls[0];
    expect(source).toBe('Second source part.');
    expect(draft).toBe('მეორე ცუდი ნაწილი.');
  });

  it('should pass the book context and the reader complaint through', async () => {
    await service.retranslate('fb-1');

    const [, , complaint, options] = mockClaude.retranslateWithFeedback.mock.calls[0];
    expect(complaint).toEqual({ selectedText: 'ცუდი', comment: 'კალკია' });
    expect(options).toMatchObject({
      bookTitle: 'My Book',
      chapterNumber: 2,
      styleGuide: 'ბრიფი',
      glossary: { John: 'ჯონი' },
    });
  });

  it('should splice the new text back into the chapter and mark the report applied', async () => {
    await service.retranslate('fb-1');

    expect(mockPrisma.translatedChapter.update).toHaveBeenCalledWith({
      where: { id: 'tc-1' },
      data: {
        translatedContent: 'პირველი ნაწილი.მეორე გამართული ნაწილი.',
        // The redo is 5 chars longer, so this chunk's end moves by 5
        segments: [
          { sourceStart: 0, sourceEnd: 18, start: 0, end: 15 },
          { sourceStart: 19, sourceEnd: 38, start: 15, end: 38 },
        ],
      },
    });
    expect(mockPrisma.translationFeedback.update).toHaveBeenCalledWith({
      where: { id: 'fb-1' },
      data: expect.objectContaining({ status: 'APPLIED' }),
    });
  });

  it('should keep the draft and reject the report when the redo comes back too short', async () => {
    mockClaude.retranslateWithFeedback.mockResolvedValue({ translatedText: 'ა', tokensUsed: 20 });

    await service.retranslate('fb-1');

    expect(mockPrisma.translatedChapter.update).not.toHaveBeenCalled();
    expect(mockPrisma.translationFeedback.update).toHaveBeenCalledWith({
      where: { id: 'fb-1' },
      data: expect.objectContaining({ status: 'REJECTED' }),
    });
  });

  it('should keep the draft when the redo is truncated', async () => {
    mockClaude.retranslateWithFeedback.mockResolvedValue({
      translatedText: 'მეორე გამართული ნაწილი რომელიც წყდება',
      tokensUsed: 16000,
      truncated: true,
    });

    await service.retranslate('fb-1');

    expect(mockPrisma.translatedChapter.update).not.toHaveBeenCalled();
    expect(mockPrisma.translationFeedback.update).toHaveBeenCalledWith({
      where: { id: 'fb-1' },
      data: expect.objectContaining({ status: 'REJECTED' }),
    });
  });

  it('should reject a report whose range matches no recorded chunk', async () => {
    mockPrisma.translationFeedback.findUnique.mockResolvedValue({
      ...feedback(),
      startPosition: 5000,
      endPosition: 5100,
    });

    await service.retranslate('fb-1');

    expect(mockClaude.retranslateWithFeedback).not.toHaveBeenCalled();
    expect(mockPrisma.translationFeedback.update).toHaveBeenCalledWith({
      where: { id: 'fb-1' },
      data: expect.objectContaining({ status: 'REJECTED' }),
    });
  });

  it('should reject a report on a chapter with no recorded chunk boundaries', async () => {
    mockPrisma.translatedChapter.findFirst.mockResolvedValue({
      ...translatedChapter(),
      segments: null,
    });

    await service.retranslate('fb-1');

    expect(mockClaude.retranslateWithFeedback).not.toHaveBeenCalled();
    expect(mockPrisma.translationFeedback.update).toHaveBeenCalledWith({
      where: { id: 'fb-1' },
      data: expect.objectContaining({ status: 'REJECTED' }),
    });
  });

  it('should do nothing for a report that was already handled', async () => {
    mockPrisma.translationFeedback.findUnique.mockResolvedValue({
      ...feedback(),
      status: 'APPLIED',
    });

    await service.retranslate('fb-1');

    expect(mockClaude.retranslateWithFeedback).not.toHaveBeenCalled();
    expect(mockPrisma.translatedChapter.update).not.toHaveBeenCalled();
  });

  it('should do nothing for an unknown report', async () => {
    mockPrisma.translationFeedback.findUnique.mockResolvedValue(null);

    await service.retranslate('fb-1');

    expect(mockClaude.retranslateWithFeedback).not.toHaveBeenCalled();
  });
});
