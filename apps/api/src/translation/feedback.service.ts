import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RetranslationProcessor } from './retranslation.processor';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

/** Re-translations a reader may trigger on one bought translation. */
const DEFAULT_RETRANSLATION_QUOTA = 30;
/** Reports one user may file per day, across all books. */
const DEFAULT_DAILY_REPORT_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
}

/**
 * Reader-reported translation problems. Each accepted report queues a targeted
 * re-translation of the affected chunk, so the text improves for whoever reads
 * it next; the reports themselves accumulate as the corpus of real errors that
 * glossary fixes and prompt examples get drawn from.
 */
@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly retranslation: RetranslationProcessor,
    private readonly config: ConfigService,
  ) {}

  async create(translationId: string, userId: string, dto: CreateFeedbackDto) {
    if (dto.endPosition <= dto.startPosition) {
      throw new BadRequestException('endPosition must be greater than startPosition');
    }

    const translation = await this.assertAccess(translationId, userId);
    if (translation.status !== 'COMPLETED') {
      throw new BadRequestException('Translation is not finished yet');
    }

    const chapter = await this.prisma.translatedChapter.findFirst({
      where: { translationId, chapter: { number: dto.chapterNumber } },
      select: { id: true, chapterId: true },
    });
    if (!chapter) {
      throw new NotFoundException('Translated chapter not found');
    }

    // Several readers hitting the same bad passage is one problem, not many:
    // collapse into the existing report so we re-translate it only once.
    const overlapping = await this.prisma.translationFeedback.findFirst({
      where: {
        translationId,
        chapterId: chapter.chapterId,
        status: { in: ['PENDING', 'RETRANSLATING'] },
        startPosition: { lt: dto.endPosition },
        endPosition: { gt: dto.startPosition },
      },
    });
    if (overlapping) {
      return this.prisma.translationFeedback.update({
        where: { id: overlapping.id },
        data: { reportCount: { increment: 1 } },
      });
    }

    await this.assertQuota(translationId);
    await this.assertRateLimit(userId);

    const feedback = await this.prisma.translationFeedback.create({
      data: {
        translationId,
        chapterId: chapter.chapterId,
        userId,
        startPosition: dto.startPosition,
        endPosition: dto.endPosition,
        selectedText: dto.selectedText,
        comment: dto.comment,
      },
    });

    // Queueing is best-effort: the report is the durable part, and a lost job
    // can be re-driven from the PENDING rows.
    try {
      await this.retranslation.enqueue(feedback.id);
    } catch (err) {
      this.logger.warn(
        `Could not queue re-translation for ${feedback.id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    this.logger.log(
      `Feedback ${feedback.id} on translation ${translationId} chapter ${dto.chapterNumber}: "${dto.selectedText.slice(0, 60)}"`,
    );
    return feedback;
  }

  async listForTranslation(translationId: string, userId: string) {
    await this.assertAccess(translationId, userId);
    return this.prisma.translationFeedback.findMany({
      where: { translationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getQuota(translationId: string, userId: string): Promise<QuotaInfo> {
    await this.assertAccess(translationId, userId);
    const limit = this.quotaLimit();
    const used = await this.prisma.translationFeedback.count({ where: { translationId } });
    return { used, limit, remaining: Math.max(0, limit - used) };
  }

  private async assertAccess(translationId: string, userId: string) {
    const translation = await this.prisma.translation.findUnique({
      where: { id: translationId },
      select: {
        id: true,
        status: true,
        book: { select: { userBooks: { where: { userId }, select: { userId: true } } } },
      },
    });
    if (!translation) {
      throw new NotFoundException('Translation not found');
    }
    if (translation.book.userBooks.length === 0) {
      throw new ForbiddenException('You do not have access to this translation');
    }
    return translation;
  }

  /**
   * The quota is per translation, not per user: it bounds what one purchase can
   * cost us in re-translations regardless of how many readers share the book.
   */
  private async assertQuota(translationId: string) {
    const used = await this.prisma.translationFeedback.count({ where: { translationId } });
    if (used >= this.quotaLimit()) {
      throw new ForbiddenException('RETRANSLATION_QUOTA_EXCEEDED');
    }
  }

  private async assertRateLimit(userId: string) {
    const limit = this.numberFromConfig('FEEDBACK_DAILY_LIMIT', DEFAULT_DAILY_REPORT_LIMIT);
    const recent = await this.prisma.translationFeedback.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
    if (recent >= limit) {
      throw new ForbiddenException('FEEDBACK_RATE_LIMIT');
    }
  }

  private quotaLimit(): number {
    return this.numberFromConfig('RETRANSLATION_QUOTA', DEFAULT_RETRANSLATION_QUOTA);
  }

  private numberFromConfig(key: string, fallback: number): number {
    const parsed = parseInt(this.config.get<string>(key) || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
