import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { ClaudeService, Glossary, TokenUsage, addUsage } from './claude.service';
import { TranslationService } from './translation.service';
import { NotificationService } from '../notification/notification.service';
import { QualityCheckService, ChapterQualityReport } from './quality-check.service';
import { GeminiJudgeService, JudgeScores } from './gemini-judge.service';
import { EditorBatchProcessor } from './editor-batch.processor';
import { TRANSLATION_QUEUE, getRedisConnection } from './translation.constants';

interface TranslationJobData {
  translationId: string;
  bookId: string;
}

interface QualitySample {
  number: number;
  source: string;
  translated: string;
}

// The judge scores an aligned slice from the top of each sampled chapter —
// enough to evaluate, small enough to keep judging cost negligible.
const JUDGE_SAMPLE_CHARS = 2500;
// Style-guide samples: enough prose to read the register, small enough that
// the brief costs one cheap call per book.
const STYLE_SAMPLE_CHARS = 4000;

@Injectable()
export class TranslationProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TranslationProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly claude: ClaudeService,
    private readonly translationService: TranslationService,
    private readonly notificationService: NotificationService,
    private readonly qualityCheck: QualityCheckService,
    private readonly geminiJudge: GeminiJudgeService,
    private readonly editorBatch: EditorBatchProcessor,
  ) {}

  onModuleInit() {
    try {
      const redisConn = getRedisConnection();
      this.logger.log(`Starting BullMQ Worker — Redis at ${redisConn.host}:${redisConn.port}, queue: "${TRANSLATION_QUEUE}"`);

      this.worker = new Worker(
        TRANSLATION_QUEUE,
        async (job: Job<TranslationJobData>) => {
          this.logger.log(`📖 Processing translation job ${job.id}: translationId=${job.data.translationId}`);
          await this.processTranslation(job);
        },
        {
          connection: redisConn,
          concurrency: 1,
          stalledInterval: 300000, // 5 minutes — translation takes long
          lockDuration: 600000,   // 10 minutes lock
        },
      );

      this.worker.on('ready', () => {
        this.logger.log('✅ Translation Worker is READY and listening for jobs');
      });

      this.worker.on('failed', (job, err) => {
        this.logger.error(`❌ Translation job ${job?.id} FAILED: ${err.message}\n${err.stack}`);
      });

      this.worker.on('completed', (job) => {
        this.logger.log(`✅ Translation job ${job.id} COMPLETED`);
      });

      this.worker.on('error', (err) => {
        this.logger.error(`❌ Worker error: ${err.message}`);
      });
    } catch (err) {
      this.logger.error(`❌ Translation worker init FAILED: ${err instanceof Error ? err.stack : err}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.logger.log('Translation Worker closed');
    }
  }

  private async processTranslation(job: Job<TranslationJobData>) {
    const { translationId, bookId } = job.data;
    this.logger.log(`🔄 Starting translation: translationId=${translationId}, bookId=${bookId}`);

    // Single query: fetch all chapters with content + book + translation in parallel.
    // Previously this was an N+1: one findMany for metadata, then findUnique per chapter.
    const [chapters, book, translation] = await Promise.all([
      this.prisma.chapter.findMany({
        where: { bookId },
        orderBy: { number: 'asc' },
        select: { id: true, number: true, originalContent: true },
      }),
      this.prisma.book.findUnique({ where: { id: bookId } }),
      this.prisma.translation.findUnique({ where: { id: translationId } }),
    ]);

    this.logger.log(`Found ${chapters.length} chapters for book ${bookId}`);

    if (chapters.length === 0) {
      await this.translationService.updateProgress(translationId, 0, 'FAILED');
      throw new Error('No chapters found for book');
    }

    if (!book) {
      await this.translationService.updateProgress(translationId, 0, 'FAILED');
      throw new Error('Book not found');
    }

    const glossary = this.claude.normalizeGlossary((translation?.glossary as Glossary) || {});
    // Premium (FAST) tier gets a second editor pass per chunk
    const editorPass = translation?.translationType === 'FAST';

    // Mark as in progress
    await this.translationService.updateProgress(translationId, 0, 'IN_PROGRESS');

    // Book-level brief, written once and reused by every chunk (and by a retry).
    const styleGuide = await this.ensureStyleGuide(translationId, book.title, chapters, translation?.styleGuide);

    // Pre-scan all chapters to estimate total chunks for granular progress
    const chapterContents = chapters.map((chapter) => ({
      meta: { id: chapter.id, number: chapter.number },
      chapter,
    }));
    const totalChunks = chapters.reduce(
      (sum, c) => sum + this.claude.estimateChunkCount(c.originalContent.length),
      0,
    );
    // Denominator for cost-per-1k-source-chars. Recorded once up front so a
    // run that fails partway still shows what it was asked to translate.
    const sourceChars = chapters.reduce((sum, c) => sum + c.originalContent.length, 0);

    this.logger.log(`Total estimated chunks across all chapters: ${totalChunks}`);

    let totalTokens = 0;
    let totalUsage: TokenUsage = { input: 0, output: 0 };
    let previousSummary: string | undefined;
    let completedChunks = 0;
    const totalChapters = chapterContents.length;
    const qualityReports: ChapterQualityReport[] = [];
    const qualitySamples: QualitySample[] = [];

    for (let i = 0; i < totalChapters; i++) {
      const { chapter } = chapterContents[i];

      try {
        this.logger.log(`📝 Translating chapter ${chapter.number}/${totalChapters} (${chapter.originalContent.length} chars)...`);

        // Keep character/place names consistent: extract new proper nouns from
        // this chapter's source and merge them into the shared glossary before
        // translating. Failures are non-fatal — translation proceeds without.
        try {
          const extraction = await this.claude.extractGlossaryTerms(
            chapter.originalContent,
            glossary,
          );
          totalTokens += extraction.tokensUsed;
          totalUsage = addUsage(totalUsage, extraction.usage);
          const newTerms = Object.keys(extraction.glossary).length;
          if (newTerms > 0) {
            Object.assign(glossary, extraction.glossary);
            this.logger.log(`Glossary: +${newTerms} terms (total ${Object.keys(glossary).length})`);
          }
        } catch (err) {
          this.logger.warn(`Glossary extraction failed for chapter ${chapter.number}: ${err instanceof Error ? err.message : err}`);
        }

        // Translate chapter with chunk-level progress callback
        const result = await this.claude.translateChapter(chapter.originalContent, {
          bookTitle: book.title,
          chapterNumber: chapter.number,
          totalChapters,
          glossary,
          previousSummary,
          styleGuide,
          editorPass,
          onChunkComplete: async () => {
            completedChunks++;
            const progress = Math.min(Math.round((completedChunks / totalChunks) * 100), 99);
            await this.translationService.updateProgress(translationId, progress);
            await job.updateProgress(progress);
          },
        });

        totalTokens += result.tokensUsed;
        totalUsage = addUsage(totalUsage, result.usage);
        this.logger.log(`✅ Chapter ${chapter.number} translated (${result.tokensUsed} tokens, ${result.translatedText.length} chars)`);

        // Mechanical quality checks — deterministic, no API calls
        const qualityReport = this.qualityCheck.checkChapter(
          chapter.originalContent,
          result.translatedText,
        );
        qualityReports.push(qualityReport);
        qualitySamples.push({
          number: chapter.number,
          source: chapter.originalContent,
          translated: result.translatedText,
        });
        if (qualityReport.flags.length > 0) {
          this.logger.warn(`⚠️ Chapter ${chapter.number} quality flags: ${qualityReport.flags.join(', ')}`);
        }

        // Save translated chapter with its quality report and chunk boundaries
        await this.translationService.saveTranslatedChapter(
          translationId,
          chapter.id,
          result.translatedText,
          qualityReport,
          result.segments,
        );

        // Save to S3
        const s3Key = this.s3.generateTranslationKey(bookId, translationId, chapter.number);
        await this.s3.upload(s3Key, Buffer.from(result.translatedText, 'utf-8'), 'text/plain');

        // Roll the story summary forward from the SOURCE, so chapter 20 still
        // knows what happened in chapter 5. Non-fatal: a failed summary only
        // costs context, it must not fail the chapter.
        try {
          const summary = await this.claude.generateStorySummary(
            chapter.originalContent,
            previousSummary,
          );
          totalTokens += summary.tokensUsed;
          totalUsage = addUsage(totalUsage, summary.usage);
          if (summary.summary) previousSummary = summary.summary;
        } catch (err) {
          this.logger.warn(`Story summary failed for chapter ${chapter.number}: ${err instanceof Error ? err.message : err}`);
        }

        // Persist accumulated tokens and the growing glossary
        await this.prisma.translation.update({
          where: { id: translationId },
          data: {
            totalTokensUsed: totalTokens,
            inputTokens: totalUsage.input,
            outputTokens: totalUsage.output,
            sourceChars,
            aiModel: this.claude.getModel(),
            glossary: glossary as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        this.logger.error(`Failed to translate chapter ${chapter.number}: ${error instanceof Error ? error.message : 'Unknown error'}`);

        await this.prisma.translation.update({
          where: { id: translationId },
          data: {
            status: 'FAILED',
            errorMessage: error instanceof Error ? error.message : 'Translation failed',
          },
        });

        throw error;
      }
    }

    // Persist the quality picture (mechanical summary + optional LLM judge).
    // Best-effort: quality must never fail a finished translation.
    await this.finalizeQuality(translationId, qualityReports, qualitySamples);

    // Mark as completed — the reader gets the draft now. For STANDARD, the
    // batch editor then upgrades the text in place; a failure there is
    // invisible to the reader, who simply keeps the draft.
    await this.translationService.updateProgress(translationId, 100, 'COMPLETED');

    if (translation?.translationType === 'STANDARD') {
      try {
        await this.editorBatch.enqueue(translationId);
      } catch (err) {
        this.logger.warn(`Could not queue the editor batch (non-fatal): ${err instanceof Error ? err.message : err}`);
      }
    }

    // Send notification
    await this.notifyCompletion(translationId, bookId);
  }

  /**
   * Return the book's style guide, generating and persisting it on first run.
   * A stored guide is reused so a retry doesn't pay for it twice, and any
   * failure degrades to translating without one.
   */
  private async ensureStyleGuide(
    translationId: string,
    bookTitle: string,
    chapters: Array<{ originalContent: string }>,
    stored?: string | null,
  ): Promise<string | undefined> {
    if (stored?.trim()) return stored;

    try {
      // Beginning, middle and end — a book's register can shift a long way
      // between its opening page and its last chapter.
      const indices = [...new Set([0, Math.floor(chapters.length / 2), chapters.length - 1])];
      const samples = indices.map((i) => chapters[i].originalContent.slice(0, STYLE_SAMPLE_CHARS));

      const { styleGuide, tokensUsed } = await this.claude.generateStyleGuide(samples, bookTitle);
      if (!styleGuide) return undefined;

      await this.prisma.translation.update({
        where: { id: translationId },
        data: { styleGuide },
      });
      this.logger.log(`Style guide generated (${styleGuide.length} chars, ${tokensUsed} tokens)`);
      return styleGuide;
    } catch (err) {
      this.logger.warn(`Style guide generation failed (non-fatal): ${err instanceof Error ? err.message : err}`);
      return undefined;
    }
  }

  /**
   * Aggregate per-chapter mechanical reports and, when a GEMINI_API_KEY is
   * configured, score up to 3 sampled chapters (first, middle, last) with the
   * Gemini judge. Never throws — quality reporting must not fail a translation.
   */
  private async finalizeQuality(
    translationId: string,
    reports: ChapterQualityReport[],
    samples: QualitySample[],
  ) {
    try {
      const mechanical = this.qualityCheck.summarize(reports);

      let judge: Record<string, unknown> | null = null;
      let qualityScore: number | undefined;

      if (this.geminiJudge.isEnabled() && samples.length > 0) {
        const pickIndices = [
          ...new Set([0, Math.floor(samples.length / 2), samples.length - 1]),
        ];
        const judged: Array<{ chapterNumber: number } & JudgeScores> = [];
        for (const index of pickIndices) {
          const sample = samples[index];
          const scores = await this.geminiJudge.judgeSample(
            sample.source.slice(0, JUDGE_SAMPLE_CHARS),
            sample.translated.slice(0, JUDGE_SAMPLE_CHARS),
          );
          if (scores) judged.push({ chapterNumber: sample.number, ...scores });
        }

        if (judged.length > 0) {
          const average = (key: 'accuracy' | 'fluency' | 'consistency' | 'overall') =>
            Math.round((judged.reduce((sum, item) => sum + item[key], 0) / judged.length) * 100) / 100;
          judge = {
            samples: judged,
            averages: {
              accuracy: average('accuracy'),
              fluency: average('fluency'),
              consistency: average('consistency'),
              overall: average('overall'),
            },
          };
          qualityScore = average('overall');
        }
      }

      await this.prisma.translation.update({
        where: { id: translationId },
        data: {
          qualityReport: { mechanical, judge } as unknown as Prisma.InputJsonValue,
          ...(qualityScore !== undefined ? { qualityScore } : {}),
        },
      });
      this.logger.log(
        `Quality: ${mechanical.chaptersFlagged}/${mechanical.chaptersChecked} chapters flagged` +
          (qualityScore !== undefined ? `, judge score ${qualityScore}/5` : ''),
      );
    } catch (err) {
      this.logger.warn(`Quality finalization failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    }
  }

  private async notifyCompletion(translationId: string, bookId: string) {
    try {
      const completedTranslation = await this.prisma.translation.findUnique({
        where: { id: translationId },
        include: { book: { include: { userBooks: { select: { userId: true } } } } },
      });
      if (completedTranslation) {
        const userIds = [...new Set(completedTranslation.book.userBooks.map(ub => ub.userId))];
        for (const uid of userIds) {
          await this.notificationService.notify({
            userId: uid,
            type: 'TRANSLATION_COMPLETED',
            titleKa: 'თარგმანი დასრულდა',
            titleEn: 'Translation Completed',
            bodyKa: `„${completedTranslation.book.title}" — თარგმანი მზადაა`,
            bodyEn: `"${completedTranslation.book.title}" — translation is ready`,
            data: { bookId, translationId, bookTitle: completedTranslation.book.title },
          });
        }
      }
    } catch (err) {
      this.logger.error(`Notification failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
