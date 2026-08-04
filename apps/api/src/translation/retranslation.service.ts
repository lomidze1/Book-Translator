import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeService, ChunkSegment, Glossary } from './claude.service';

/** A redo shorter than this fraction of the draft is treated as a failure. */
const MIN_REDO_RATIO = 0.5;

/**
 * Targeted re-translation of a passage a reader flagged.
 *
 * The unit of work is the chunk the passage falls in, not the sentence: a
 * sentence re-translated on its own loses the surrounding context and usually
 * comes back worse. A chunk is one API call — the same call the original
 * translation made — so the cost of a report is bounded and predictable.
 */
@Injectable()
export class RetranslationService {
  private readonly logger = new Logger(RetranslationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  async retranslate(feedbackId: string): Promise<void> {
    const feedback = await this.prisma.translationFeedback.findUnique({
      where: { id: feedbackId },
      include: {
        translation: {
          select: {
            id: true,
            glossary: true,
            styleGuide: true,
            book: { select: { title: true } },
            translatedChapters: { select: { chapterId: true } },
          },
        },
        chapter: { select: { number: true, originalContent: true } },
      },
    });

    if (!feedback) return;
    if (feedback.status !== 'PENDING') {
      this.logger.log(`Feedback ${feedbackId} is ${feedback.status} — nothing to do`);
      return;
    }

    const translatedChapter = await this.prisma.translatedChapter.findFirst({
      where: { translationId: feedback.translationId, chapterId: feedback.chapterId },
      select: { id: true, translatedContent: true, segments: true },
    });
    if (!translatedChapter) {
      await this.reject(feedbackId, 'translated chapter is gone');
      return;
    }

    const segments = this.resolveSegments(
      translatedChapter.segments,
      translatedChapter.translatedContent,
      feedback.chapter.originalContent,
    );
    const index = segments.findIndex(
      (segment) => segment.start < feedback.endPosition && segment.end > feedback.startPosition,
    );
    if (index === -1) {
      // Either the chapter predates chunk tracking, or the text has moved on
      // since the reader selected it. Re-translating blind would corrupt it.
      await this.reject(feedbackId, 'no chunk covers the reported range');
      return;
    }

    await this.prisma.translationFeedback.update({
      where: { id: feedbackId },
      data: { status: 'RETRANSLATING' },
    });

    const segment = segments[index];
    const source = feedback.chapter.originalContent.slice(segment.sourceStart, segment.sourceEnd);
    const draft = translatedChapter.translatedContent.slice(segment.start, segment.end);

    const result = await this.claude.retranslateWithFeedback(
      source,
      draft,
      { selectedText: feedback.selectedText, comment: feedback.comment },
      {
        bookTitle: feedback.translation.book.title,
        chapterNumber: feedback.chapter.number,
        totalChapters: feedback.translation.translatedChapters.length,
        glossary: (feedback.translation.glossary as Glossary) || undefined,
        styleGuide: feedback.translation.styleGuide || undefined,
      },
    );

    const redone = result.translatedText.trim();
    if (result.truncated || redone.length < draft.trim().length * MIN_REDO_RATIO) {
      await this.reject(feedbackId, result.truncated ? 'redo was truncated' : 'redo came back too short');
      return;
    }

    // Splicing changes the chapter's length, so every later chunk boundary
    // shifts by the same delta — otherwise the batch editor and any future
    // report would address the wrong text.
    const delta = redone.length - (segment.end - segment.start);
    const updatedSegments = segments.map((current, i) =>
      i < index
        ? current
        : i === index
          ? { ...current, end: current.end + delta }
          : { ...current, start: current.start + delta, end: current.end + delta },
    );

    const content =
      translatedChapter.translatedContent.slice(0, segment.start) +
      redone +
      translatedChapter.translatedContent.slice(segment.end);

    await this.prisma.translatedChapter.update({
      where: { id: translatedChapter.id },
      data: {
        translatedContent: content,
        segments: updatedSegments as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prisma.translationFeedback.update({
      where: { id: feedbackId },
      data: { status: 'APPLIED', resolvedAt: new Date() },
    });

    this.logger.log(
      `Feedback ${feedbackId}: chunk ${index + 1} of chapter ${feedback.chapter.number} re-translated (${result.tokensUsed} tokens)`,
    );
  }

  private async reject(feedbackId: string, reason: string): Promise<void> {
    this.logger.warn(`Feedback ${feedbackId} rejected — ${reason}`);
    await this.prisma.translationFeedback.update({
      where: { id: feedbackId },
      data: { status: 'REJECTED', resolvedAt: new Date() },
    });
  }

  /**
   * Chunk boundaries for a chapter, falling back for books translated before
   * they were recorded: if the whole chapter is one chunk anyway, it can be
   * redone as a single segment. A multi-chunk chapter without them stays
   * unfixable — redoing it in one call would blow the output ceiling, and
   * guessing where the boundaries were would corrupt the text.
   */
  private resolveSegments(raw: unknown, translated: string, source: string): ChunkSegment[] {
    const stored = this.readSegments(raw, translated, source);
    if (stored.length > 0) return stored;

    if (!translated.length || this.claude.estimateChunkCount(source.length) !== 1) return [];
    return [{ sourceStart: 0, sourceEnd: source.length, start: 0, end: translated.length }];
  }

  /** Stored ranges are only trustworthy if they still address real text. */
  private readSegments(raw: unknown, translated: string, source: string): ChunkSegment[] {
    if (!Array.isArray(raw)) return [];
    return (raw as ChunkSegment[]).filter(
      (segment) =>
        Number.isInteger(segment?.start) &&
        Number.isInteger(segment?.end) &&
        Number.isInteger(segment?.sourceStart) &&
        Number.isInteger(segment?.sourceEnd) &&
        segment.start < segment.end &&
        segment.sourceStart < segment.sourceEnd &&
        segment.end <= translated.length &&
        segment.sourceEnd <= source.length,
    );
  }
}
