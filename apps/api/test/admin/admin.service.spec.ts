import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminService } from '../../src/admin/admin.service';

describe('AdminService', () => {
  let adminService: AdminService;

  const mockPrisma = {
    user: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    book: { count: vi.fn() },
    translation: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      aggregate: vi.fn(),
    },
    translatedChapter: { count: vi.fn(), findMany: vi.fn() },
    translationFeedback: { groupBy: vi.fn() },
    payment: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };

  const mockTranslationService = {
    updateProgress: vi.fn(),
    startTranslation: vi.fn(),
    clearQueuedJob: vi.fn().mockResolvedValue(false),
    getQueueDepth: vi.fn().mockResolvedValue({ waiting: 0, active: 0, failed: 0 }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adminService = new AdminService(mockPrisma as any, mockTranslationService as any);
  });

  describe('getStats', () => {
    /**
     * Stats fires many counts in parallel, so ordered mocks would silently
     * mis-assign the moment a query is added. Answer by `where` instead.
     */
    const stubStats = (over: Record<string, unknown> = {}) => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.book.count.mockResolvedValue(0);
      mockPrisma.translation.count.mockResolvedValue(0);
      mockPrisma.translation.aggregate.mockResolvedValue({ _sum: { totalTokensUsed: 0 }, _avg: { qualityScore: null } });
      mockPrisma.translation.findMany.mockResolvedValue([]);
      mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: null } });
      mockPrisma.payment.count.mockResolvedValue(0);
      mockPrisma.translatedChapter.count.mockResolvedValue(0);
      mockPrisma.translatedChapter.findMany.mockResolvedValue([]);
      mockPrisma.translationFeedback.groupBy.mockResolvedValue([]);
      Object.assign(mockPrisma, over);
    };

    it('reports users across the time windows', async () => {
      stubStats();
      mockPrisma.user.count.mockImplementation(({ where } = {} as any) => {
        if (!where) return Promise.resolve(52);
        if (where.emailVerified) return Promise.resolve(40); // { not: null }
        if (where.createdAt?.gte) {
          const days = (Date.now() - where.createdAt.gte.getTime()) / 86400000;
          return Promise.resolve(days < 8 ? 6 : 28);
        }
        return Promise.resolve(0);
      });

      const result = await adminService.getStats();

      expect(result.users).toMatchObject({ total: 52, new7d: 6, new30d: 28, verified: 40 });
    });

    it('splits the translation funnel by status and flags stuck jobs', async () => {
      stubStats();
      mockPrisma.translation.count.mockImplementation(({ where } = {} as any) => {
        if (!where) return Promise.resolve(100);
        if (where.status === 'COMPLETED' && where.completedAt) return Promise.resolve(12);
        if (where.status === 'COMPLETED') return Promise.resolve(80);
        if (where.status === 'FAILED') return Promise.resolve(3);
        if (where.status === 'IN_PROGRESS' && where.updatedAt) return Promise.resolve(2);
        if (where.status?.in?.includes('IN_PROGRESS')) return Promise.resolve(5);
        if (where.status === 'PENDING') return Promise.resolve(7);
        return Promise.resolve(0);
      });

      const result = await adminService.getStats();

      expect(result.translations).toMatchObject({
        total: 100,
        completed: 80,
        completed30d: 12,
        failed: 3,
        inProgress: 5,
        pending: 7,
        stuck: 2,
      });
    });

    it('computes net revenue as gross minus refunds', async () => {
      stubStats();
      mockPrisma.payment.aggregate.mockImplementation(({ where } = {} as any) => {
        if (where?.status === 'REFUNDED') return Promise.resolve({ _sum: { amount: 30 } });
        if (where?.paidAt?.gte) {
          const days = (Date.now() - where.paidAt.gte.getTime()) / 86400000;
          return Promise.resolve({ _sum: { amount: days < 8 ? 50 : 200 } });
        }
        return Promise.resolve({ _sum: { amount: 900 } });
      });

      const result = await adminService.getStats();

      expect(result.revenue).toMatchObject({
        gross30d: 200,
        refunded30d: 30,
        net30d: 170,
        last7d: 50,
        allTime: 900,
        currency: 'GEL',
      });
    });

    it('summarizes quality scores, chapter flags and reader feedback', async () => {
      stubStats();
      mockPrisma.translation.aggregate.mockResolvedValue({
        _sum: { totalTokensUsed: 0 },
        _avg: { qualityScore: 4.25 },
      });
      mockPrisma.translation.count.mockImplementation(({ where } = {} as any) =>
        Promise.resolve(where?.qualityScore ? 9 : 0),
      );
      mockPrisma.translatedChapter.count.mockResolvedValue(50);
      mockPrisma.translatedChapter.findMany.mockResolvedValue([
        { qualityReport: { flags: ['LATIN_LEAKAGE', 'NUMBER_MISMATCH'] } },
        { qualityReport: { flags: ['LATIN_LEAKAGE'] } },
        { qualityReport: { flags: [] } },
        { qualityReport: null },
      ]);
      mockPrisma.translationFeedback.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { _all: 4 } },
        { status: 'APPLIED', _count: { _all: 6 } },
      ]);

      const result = await adminService.getStats();

      expect(result.quality).toMatchObject({
        scoredTranslations: 9,
        avgScore: 4.25,
        chaptersChecked: 50,
        chaptersFlagged: 2,
        flagCounts: { LATIN_LEAKAGE: 2, NUMBER_MISMATCH: 1 },
        feedback: { PENDING: 4, APPLIED: 6, total: 10 },
      });
    });

    it('estimates API cost from recorded token usage', async () => {
      stubStats();
      mockPrisma.translation.aggregate.mockImplementation(({ where } = {} as any) =>
        Promise.resolve({
          _sum: { totalTokensUsed: where?.completedAt ? 2_000_000 : 10_000_000 },
          _avg: { qualityScore: null },
        }),
      );

      const result = await adminService.getStats();

      expect(result.cost.tokens30d).toBe(2_000_000);
      expect(result.cost.tokensAllTime).toBe(10_000_000);
      // Blended rate — the split between input and output tokens isn't stored
      expect(result.cost.usd30d).toBeGreaterThan(0);
      expect(result.cost.approximate).toBe(true);
    });

    it('reports average completion time in minutes', async () => {
      stubStats();
      mockPrisma.translation.findMany.mockResolvedValue([
        { startedAt: new Date('2026-01-01T10:00:00Z'), completedAt: new Date('2026-01-01T10:30:00Z') },
        { startedAt: new Date('2026-01-01T12:00:00Z'), completedAt: new Date('2026-01-01T13:10:00Z') },
      ]);

      const result = await adminService.getStats();

      expect(result.translations.avgMinutes).toBe(50);
    });

    it('survives a queue that cannot be reached', async () => {
      stubStats();
      mockTranslationService.getQueueDepth.mockRejectedValue(new Error('Redis down'));

      const result = await adminService.getStats();

      // A dead Redis must not take the whole dashboard down
      expect(result.queue).toBeNull();
      expect(result.users.total).toBe(0);
    });

    it('returns zeroes rather than nulls on an empty database', async () => {
      stubStats();

      const result = await adminService.getStats();

      expect(result.revenue.allTime).toBe(0);
      expect(result.cost.tokensAllTime).toBe(0);
      expect(result.quality.avgScore).toBeNull();
      expect(result.translations.avgMinutes).toBeNull();
      expect(result.generatedAt).toBeTypeOf('string');
    });
  });

  describe('listUsers', () => {
    it('filters by search term across email and name', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1', email: 'a@b.com' }]);
      mockPrisma.user.count.mockResolvedValue(1);

      await adminService.listUsers({ page: 1, limit: 50, search: 'alice' });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { email: { contains: 'alice', mode: 'insensitive' } },
              { name: { contains: 'alice', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('clamps limit above max', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      const result = await adminService.listUsers({ page: 1, limit: 9999 });

      expect(result.limit).toBeLessThanOrEqual(100);
    });

    it('omits where clause when no search', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await adminService.listUsers({});

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('updateUserRole', () => {
    it('promotes user to ADMIN', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'USER' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', role: 'ADMIN' });

      const result = await adminService.updateUserRole('u1', 'ADMIN');

      expect(result.role).toBe('ADMIN');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' }, data: { role: 'ADMIN' } }),
      );
    });

    it('throws NotFoundException for missing user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(adminService.updateUserRole('missing', 'ADMIN')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('verifyUserEmail', () => {
    it('sets emailVerified to now and clears token fields', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', emailVerified: null });
      mockPrisma.user.update.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        emailVerified: new Date(),
      });

      await adminService.verifyUserEmail('u1');

      const call = mockPrisma.user.update.mock.calls[0][0];
      expect(call.data.emailVerified).toBeInstanceOf(Date);
      expect(call.data.emailVerificationToken).toBeNull();
      expect(call.data.emailVerificationExpires).toBeNull();
    });

    it('throws BadRequestException when already verified', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        emailVerified: new Date(),
      });
      await expect(adminService.verifyUserEmail('u1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for missing user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(adminService.verifyUserEmail('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listTranslations', () => {
    it('filters by status when provided', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([]);
      mockPrisma.translation.count.mockResolvedValue(0);

      await adminService.listTranslations({ status: 'FAILED' });

      expect(mockPrisma.translation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'FAILED' } }),
      );
    });

    it('searches book title + author', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([]);
      mockPrisma.translation.count.mockResolvedValue(0);

      await adminService.listTranslations({ search: 'clean code' });

      const where = mockPrisma.translation.findMany.mock.calls[0][0].where;
      expect(where.book.OR).toEqual([
        { title: { contains: 'clean code', mode: 'insensitive' } },
        { author: { contains: 'clean code', mode: 'insensitive' } },
      ]);
    });
  });

  describe('retryTranslation', () => {
    const STUCK_MS = 30 * 60 * 1000;

    it('resets and re-enqueues a FAILED translation, clearing any stale job', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue({
        id: 't1',
        status: 'FAILED',
        updatedAt: new Date(),
      });
      mockTranslationService.startTranslation.mockResolvedValue({ id: 't1' });

      await adminService.retryTranslation('t1');

      expect(mockTranslationService.clearQueuedJob).toHaveBeenCalledWith('t1');
      expect(mockTranslationService.updateProgress).toHaveBeenCalledWith('t1', 0, 'PAID');
      expect(mockTranslationService.startTranslation).toHaveBeenCalledWith('t1');
    });

    it('retries an IN_PROGRESS translation only after the stuck threshold elapses', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue({
        id: 't1',
        status: 'IN_PROGRESS',
        updatedAt: new Date(Date.now() - STUCK_MS - 60_000),
      });
      mockTranslationService.startTranslation.mockResolvedValue({ id: 't1' });

      await adminService.retryTranslation('t1');

      expect(mockTranslationService.updateProgress).toHaveBeenCalled();
    });

    it('refuses to retry a recently-updated IN_PROGRESS translation', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue({
        id: 't1',
        status: 'IN_PROGRESS',
        updatedAt: new Date(Date.now() - 60_000), // 1 minute ago
      });

      await expect(adminService.retryTranslation('t1')).rejects.toThrow(BadRequestException);
      expect(mockTranslationService.updateProgress).not.toHaveBeenCalled();
    });

    it('refuses to retry a COMPLETED translation', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue({
        id: 't1',
        status: 'COMPLETED',
        updatedAt: new Date(),
      });

      await expect(adminService.retryTranslation('t1')).rejects.toThrow(BadRequestException);
      expect(mockTranslationService.updateProgress).not.toHaveBeenCalled();
    });

    it('propagates the "actively running" error from clearQueuedJob', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue({
        id: 't1',
        status: 'FAILED',
        updatedAt: new Date(),
      });
      mockTranslationService.clearQueuedJob.mockRejectedValueOnce(
        new BadRequestException('Translation is actively being processed — wait for it to finish or fail.'),
      );

      await expect(adminService.retryTranslation('t1')).rejects.toThrow(BadRequestException);
      expect(mockTranslationService.updateProgress).not.toHaveBeenCalled();
      expect(mockTranslationService.startTranslation).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for missing translation', async () => {
      mockPrisma.translation.findUnique.mockResolvedValue(null);
      await expect(adminService.retryTranslation('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listPayments', () => {
    it('searches by user email and name', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.count.mockResolvedValue(0);

      await adminService.listPayments({ search: 'giorgi' });

      const where = mockPrisma.payment.findMany.mock.calls[0][0].where;
      expect(where.user.OR).toEqual([
        { email: { contains: 'giorgi', mode: 'insensitive' } },
        { name: { contains: 'giorgi', mode: 'insensitive' } },
      ]);
    });

    it('filters by status', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.count.mockResolvedValue(0);

      await adminService.listPayments({ status: 'COMPLETED' });

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'COMPLETED' } }),
      );
    });
  });
});
