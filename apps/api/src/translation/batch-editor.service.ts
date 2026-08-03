import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeService, ChunkSegment, EditorBatchRequest, Glossary } from './claude.service';

export interface PollResult {
  done: boolean;
  /** Chapters whose stored text was actually improved. */
  applied: number;
}

/** A refined segment shorter than this fraction of the draft is discarded. */
const MIN_REFINED_RATIO = 0.5;

/**
 * Editor pass for the STANDARD tier, run through the Message Batches API at
 * half price. FAST gets its editor pass inline during translation; STANDARD
 * would double its cost that way, so instead the draft is delivered first and
 * the batch upgrades the text in place when it lands (up to 24h later). A
 * failed batch simply leaves the reader with the draft.
 */
@Injectable()
export class BatchEditorService {
  private readonly logger = new Logger(BatchEditorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  /** Queue the editor pass for a finished STANDARD translation. */
  async submit(translationId: string): Promise<string | null> {
    const translation = await this.load(translationId);
    if (!translation) return null;

    if (translation.translationType !== 'STANDARD') return null;
    if (translation.editorBatchId) {
      this.logger.log(`Translation ${translationId} already has an editor batch — skipping`);
      return null;
    }

    const requests = this.buildRequests(translation);
    if (requests.length === 0) {
      this.logger.log(`Translation ${translationId}: nothing to edit (no usable segments)`);
      return null;
    }

    const batchId = await this.claude.submitEditorBatch(requests);
    if (!batchId) return null;

    await this.prisma.translation.update({
      where: { id: translationId },
      data: { editorBatchId: batchId, editorBatchStatus: 'SUBMITTED' },
    });
    this.logger.log(`Editor batch ${batchId} submitted for ${translationId} (${requests.length} segments)`);
    return batchId;
  }

  /**
   * Check the batch and, once it has ended, splice the refined segments back
   * into each chapter. Returns `done: false` while the batch is still running
   * so the caller can re-poll later.
   */
  async poll(translationId: string): Promise<PollResult> {
    const translation = await this.load(translationId);
    if (!translation?.editorBatchId) return { done: true, applied: 0 };

    if (!(await this.claude.isBatchEnded(translation.editorBatchId))) {
      return { done: false, applied: 0 };
    }

    const results = await this.claude.getBatchResults(translation.editorBatchId);
    // Results arrive in arbitrary order — always match on custom_id.
    const byCustomId = new Map(results.map((result) => [result.customId, result]));

    let applied = 0;
    for (const chapter of translation.translatedChapters) {
      const segments = this.readSegments(chapter.segments, chapter.translatedContent, chapter.chapter.originalContent);
      if (segments.length === 0) continue;

      let changed = false;
      // Right to left, so earlier offsets stay valid as text is spliced in.
      let content = chapter.translatedContent;
      for (let i = segments.length - 1; i >= 0; i--) {
        const result = byCustomId.get(`${chapter.id}_${i}`);
        if (!result?.ok || !result.text.trim()) continue;

        const draft = chapter.translatedContent.slice(segments[i].start, segments[i].end);
        if (result.text.trim().length < draft.trim().length * MIN_REFINED_RATIO) {
          this.logger.warn(`Editor segment ${chapter.id}_${i} came back too short — keeping the draft`);
          continue;
        }

        content = content.slice(0, segments[i].start) + result.text + content.slice(segments[i].end);
        changed = true;
      }

      if (changed) {
        await this.prisma.translatedChapter.update({
          where: { id: chapter.id },
          data: { translatedContent: content },
        });
        applied++;
      }
    }

    await this.prisma.translation.update({
      where: { id: translationId },
      data: { editorBatchStatus: 'APPLIED' },
    });
    this.logger.log(`Editor batch ${translation.editorBatchId} applied to ${applied} chapter(s)`);
    return { done: true, applied };
  }

  private load(translationId: string) {
    return this.prisma.translation.findUnique({
      where: { id: translationId },
      include: {
        book: { select: { title: true } },
        translatedChapters: {
          include: { chapter: { select: { number: true, originalContent: true } } },
          orderBy: { chapter: { number: 'asc' } },
        },
      },
    });
  }

  private buildRequests(translation: LoadedTranslation): EditorBatchRequest[] {
    const requests: EditorBatchRequest[] = [];

    for (const chapter of translation.translatedChapters) {
      const source = chapter.chapter.originalContent;
      const segments = this.readSegments(chapter.segments, chapter.translatedContent, source);

      segments.forEach((segment, index) => {
        requests.push({
          customId: `${chapter.id}_${index}`,
          source: source.slice(segment.sourceStart, segment.sourceEnd),
          draft: chapter.translatedContent.slice(segment.start, segment.end),
          options: {
            bookTitle: translation.book.title,
            chapterNumber: chapter.chapter.number,
            totalChapters: translation.translatedChapters.length,
            glossary: (translation.glossary as Glossary) || undefined,
            styleGuide: translation.styleGuide || undefined,
          },
        });
      });
    }

    return requests;
  }

  /**
   * Validate stored segment ranges against the text they claim to address.
   * A chapter re-translated under a different chunk size would otherwise
   * splice refined text into the wrong place.
   */
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

type LoadedTranslation = NonNullable<Awaited<ReturnType<BatchEditorService['load']>>>;
