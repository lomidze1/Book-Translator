import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationService } from '../translation/translation.service';
import { STUCK_TRANSLATION_THRESHOLD_MS } from '../translation/translation.constants';
import { clampPagination } from '../common/pagination';
import {
  AdminListQueryDto,
  AdminPaymentsQueryDto,
  AdminTranslationsQueryDto,
} from './dto';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Chapters sampled for the flag breakdown — enough to see the shape, bounded. */
const FLAG_SCAN_LIMIT = 2000;
/** Recent translations sampled for the average duration. */
const DURATION_SAMPLE_LIMIT = 200;
/**
 * Midpoint of Sonnet 5's $3 input / $15 output per MTok. Only the combined
 * token count is stored, so the split is unknowable — override with
 * CLAUDE_BLENDED_USD_PER_MTOK once real invoices show the true ratio.
 */
const DEFAULT_BLENDED_USD_PER_MTOK = 9;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly translationService: TranslationService,
  ) {}

  /**
   * Everything the dashboard needs in one round trip: where users and money
   * are, how far each translation got, what is stuck, and what the output
   * quality and API spend look like.
   */
  async getStats() {
    const now = Date.now();
    const since7d = new Date(now - 7 * DAY_MS);
    const since30d = new Date(now - 30 * DAY_MS);
    const stuckBefore = new Date(now - STUCK_TRANSLATION_THRESHOLD_MS);

    const sum = (result: { _sum: { amount: Prisma.Decimal | null } }) =>
      Number(result._sum.amount ?? 0);

    const [
      usersTotal, usersNew7d, usersNew30d, usersActive30d, usersVerified,
      booksTotal, booksNew30d,
      trTotal, trCompleted, trCompleted30d, trFailed, trInProgress, trPending, trStuck,
      revenueAllTime, revenue30d, revenue7d, refunded30d,
      paymentsCompleted30d, paymentsFailed30d, paymentsPending,
      tokensAllTime, tokens30d, qualityAvg, qualityScored,
      chaptersChecked, flaggedChapters, feedbackByStatus,
      recentDurations,
      queue,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: since7d } } }),
      this.prisma.user.count({ where: { createdAt: { gte: since30d } } }),
      this.prisma.user.count({ where: { updatedAt: { gte: since30d } } }),
      // emailVerified holds the verification timestamp, not a boolean
      this.prisma.user.count({ where: { emailVerified: { not: null } } }),

      this.prisma.book.count(),
      this.prisma.book.count({ where: { createdAt: { gte: since30d } } }),

      this.prisma.translation.count(),
      this.prisma.translation.count({ where: { status: 'COMPLETED' } }),
      this.prisma.translation.count({ where: { status: 'COMPLETED', completedAt: { gte: since30d } } }),
      this.prisma.translation.count({ where: { status: 'FAILED' } }),
      this.prisma.translation.count({ where: { status: { in: ['PAID', 'IN_PROGRESS'] } } }),
      this.prisma.translation.count({ where: { status: 'PENDING' } }),
      // Worker heartbeats bump updatedAt, so a row that hasn't moved is orphaned
      this.prisma.translation.count({ where: { status: 'IN_PROGRESS', updatedAt: { lt: stuckBefore } } }),

      this.prisma.payment.aggregate({ where: { status: 'COMPLETED' }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { status: 'COMPLETED', paidAt: { gte: since30d } }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { status: 'COMPLETED', paidAt: { gte: since7d } }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { status: 'REFUNDED', updatedAt: { gte: since30d } }, _sum: { amount: true } }),

      this.prisma.payment.count({ where: { status: 'COMPLETED', paidAt: { gte: since30d } } }),
      this.prisma.payment.count({ where: { status: 'FAILED', createdAt: { gte: since30d } } }),
      this.prisma.payment.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),

      this.prisma.translation.aggregate({ _sum: { totalTokensUsed: true }, _avg: { qualityScore: true } }),
      this.prisma.translation.aggregate({ where: { completedAt: { gte: since30d } }, _sum: { totalTokensUsed: true }, _avg: { qualityScore: true } }),
      this.prisma.translation.aggregate({ where: { qualityScore: { not: null } }, _sum: { totalTokensUsed: true }, _avg: { qualityScore: true } }),
      this.prisma.translation.count({ where: { qualityScore: { not: null } } }),

      this.prisma.translatedChapter.count({ where: { qualityReport: { not: Prisma.DbNull } } }),
      this.prisma.translatedChapter.findMany({
        where: { qualityReport: { not: Prisma.DbNull } },
        select: { qualityReport: true },
        take: FLAG_SCAN_LIMIT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.translationFeedback.groupBy({ by: ['status'], _count: { _all: true } }),

      this.prisma.translation.findMany({
        where: { status: 'COMPLETED', startedAt: { not: null }, completedAt: { not: null } },
        select: { startedAt: true, completedAt: true },
        take: DURATION_SAMPLE_LIMIT,
        orderBy: { completedAt: 'desc' },
      }),

      // A dead Redis must degrade one card, not the whole dashboard
      this.translationService.getQueueDepth().catch(() => null),
    ]);

    const gross30d = sum(revenue30d);
    const refundedAmount30d = sum(refunded30d);

    return {
      generatedAt: new Date(now).toISOString(),

      users: {
        total: usersTotal,
        new7d: usersNew7d,
        new30d: usersNew30d,
        active30d: usersActive30d,
        verified: usersVerified,
      },

      books: { total: booksTotal, new30d: booksNew30d },

      translations: {
        total: trTotal,
        completed: trCompleted,
        completed30d: trCompleted30d,
        failed: trFailed,
        inProgress: trInProgress,
        pending: trPending,
        stuck: trStuck,
        avgMinutes: this.averageMinutes(recentDurations),
      },

      revenue: {
        allTime: sum(revenueAllTime),
        gross30d,
        refunded30d: refundedAmount30d,
        net30d: gross30d - refundedAmount30d,
        last7d: sum(revenue7d),
        currency: 'GEL',
      },

      payments: {
        completed30d: paymentsCompleted30d,
        failed30d: paymentsFailed30d,
        pending: paymentsPending,
        // Of the people who signed up this month, how many paid for anything
        conversionRate: usersNew30d > 0 ? Math.round((paymentsCompleted30d / usersNew30d) * 1000) / 10 : 0,
      },

      quality: {
        scoredTranslations: qualityScored,
        avgScore: qualityAvg._avg.qualityScore ?? null,
        chaptersChecked,
        ...this.summarizeFlags(flaggedChapters),
        feedback: this.summarizeFeedback(feedbackByStatus),
      },

      cost: this.estimateCost(
        Number(tokensAllTime._sum.totalTokensUsed ?? 0),
        Number(tokens30d._sum.totalTokensUsed ?? 0),
      ),

      queue,
    };
  }

  private averageMinutes(rows: Array<{ startedAt: Date | null; completedAt: Date | null }>): number | null {
    const spans = rows
      .filter((row): row is { startedAt: Date; completedAt: Date } => !!row.startedAt && !!row.completedAt)
      .map((row) => row.completedAt.getTime() - row.startedAt.getTime())
      .filter((ms) => ms >= 0);
    if (spans.length === 0) return null;
    const mean = spans.reduce((total, ms) => total + ms, 0) / spans.length;
    return Math.round(mean / 60000);
  }

  /** Count each mechanical flag across the sampled chapter reports. */
  private summarizeFlags(rows: Array<{ qualityReport: unknown }>) {
    const flagCounts: Record<string, number> = {};
    let chaptersFlagged = 0;

    for (const row of rows) {
      const flags = (row.qualityReport as { flags?: unknown })?.flags;
      if (!Array.isArray(flags) || flags.length === 0) continue;
      chaptersFlagged++;
      for (const flag of flags) {
        const key = String(flag);
        flagCounts[key] = (flagCounts[key] || 0) + 1;
      }
    }
    return { chaptersFlagged, flagCounts };
  }

  private summarizeFeedback(rows: Array<{ status: string; _count: { _all: number } }>) {
    const feedback: Record<string, number> = { total: 0 };
    for (const row of rows) {
      feedback[row.status] = row._count._all;
      feedback.total += row._count._all;
    }
    return feedback;
  }

  /**
   * Only the combined input+output token count is stored, so an exact cost
   * cannot be derived — this applies one blended rate and is flagged as
   * approximate so nobody reads it as billing truth.
   */
  private estimateCost(tokensAllTime: number, tokens30d: number) {
    const perMTok = Number(process.env.CLAUDE_BLENDED_USD_PER_MTOK) || DEFAULT_BLENDED_USD_PER_MTOK;
    const usd = (tokens: number) => Math.round((tokens / 1_000_000) * perMTok * 100) / 100;
    return {
      tokensAllTime,
      tokens30d,
      usdAllTime: usd(tokensAllTime),
      usd30d: usd(tokens30d),
      blendedUsdPerMTok: perMTok,
      approximate: true,
    };
  }

  async listUsers(query: AdminListQueryDto) {
    const { skip, take, page, limit } = clampPagination(query.page, query.limit, {
      defaultLimit: 50,
      maxLimit: 100,
    });
    const where = query.search
      ? {
          OR: [
            { email: { contains: query.search, mode: 'insensitive' as const } },
            { name: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          role: true,
          emailVerified: true,
          phoneVerified: true,
          locale: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async updateUserRole(userId: string, role: 'USER' | 'ADMIN') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, name: true, role: true },
    });
  }

  async verifyUserEmail(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified: new Date(),
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
      select: { id: true, email: true, emailVerified: true },
    });
  }

  async listTranslations(query: AdminTranslationsQueryDto) {
    const { skip, take, page, limit } = clampPagination(query.page, query.limit, {
      defaultLimit: 50,
      maxLimit: 100,
    });

    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            book: {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' as const } },
                { author: { contains: query.search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.translation.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          book: { select: { id: true, title: true, author: true } },
        },
      }),
      this.prisma.translation.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async retryTranslation(translationId: string) {
    const translation = await this.prisma.translation.findUnique({
      where: { id: translationId },
    });
    if (!translation) throw new NotFoundException('Translation not found');

    // FAILED is always safe. IN_PROGRESS we treat as stuck only if the row
    // hasn't been touched in 30 minutes — otherwise a worker is probably
    // mid-chapter and we'd race it.
    if (translation.status === 'IN_PROGRESS') {
      const ageMs = Date.now() - translation.updatedAt.getTime();
      if (ageMs < STUCK_TRANSLATION_THRESHOLD_MS) {
        const minsAgo = Math.floor(ageMs / 60000);
        throw new BadRequestException(
          `Translation was updated ${minsAgo} minute(s) ago — not yet considered stuck. ` +
            `Wait until it goes ${Math.floor(STUCK_TRANSLATION_THRESHOLD_MS / 60000)} minutes without progress.`,
        );
      }
    } else if (translation.status !== 'FAILED') {
      throw new BadRequestException(
        `Cannot retry translation in status ${translation.status}`,
      );
    }

    // Drop the stale job before re-enqueueing so BullMQ accepts the new add()
    // (deterministic jobId would otherwise reject the duplicate). Throws if a
    // job is actively running — surface that to the admin instead of racing.
    await this.translationService.clearQueuedJob(translationId);
    await this.translationService.updateProgress(translationId, 0, 'PAID');
    return this.translationService.startTranslation(translationId);
  }

  async listPayments(query: AdminPaymentsQueryDto) {
    const { skip, take, page, limit } = clampPagination(query.page, query.limit, {
      defaultLimit: 50,
      maxLimit: 100,
    });

    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            user: {
              OR: [
                { email: { contains: query.search, mode: 'insensitive' as const } },
                { name: { contains: query.search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          type: true,
          provider: true,
          description: true,
          paidAt: true,
          createdAt: true,
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { items, total, page, limit };
  }
}
