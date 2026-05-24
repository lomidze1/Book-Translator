import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationService } from '../translation/translation.service';
import { STUCK_TRANSLATION_THRESHOLD_MS } from '../translation/translation.constants';
import { clampPagination } from '../common/pagination';
import {
  AdminListQueryDto,
  AdminPaymentsQueryDto,
  AdminTranslationsQueryDto,
} from './dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly translationService: TranslationService,
  ) {}

  async getStats() {
    const [
      userCount,
      bookCount,
      translationsCompleted,
      translationsFailed,
      translationsInProgress,
      revenue,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.book.count(),
      this.prisma.translation.count({ where: { status: 'COMPLETED' } }),
      this.prisma.translation.count({ where: { status: 'FAILED' } }),
      this.prisma.translation.count({ where: { status: { in: ['PAID', 'IN_PROGRESS'] } } }),
      this.prisma.payment.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
    ]);

    return {
      users: userCount,
      books: bookCount,
      translations: {
        completed: translationsCompleted,
        failed: translationsFailed,
        inProgress: translationsInProgress,
      },
      revenue: revenue._sum.amount ?? 0,
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
