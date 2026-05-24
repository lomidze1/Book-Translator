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
    },
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adminService = new AdminService(mockPrisma as any, mockTranslationService as any);
  });

  describe('getStats', () => {
    it('aggregates counts and revenue', async () => {
      mockPrisma.user.count.mockResolvedValue(42);
      mockPrisma.book.count.mockResolvedValue(120);
      mockPrisma.translation.count
        .mockResolvedValueOnce(80) // completed
        .mockResolvedValueOnce(3) // failed
        .mockResolvedValueOnce(5); // in-progress
      mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 1250.5 } });

      const result = await adminService.getStats();

      expect(result).toEqual({
        users: 42,
        books: 120,
        translations: { completed: 80, failed: 3, inProgress: 5 },
        revenue: 1250.5,
      });
    });

    it('returns 0 revenue when no completed payments', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.book.count.mockResolvedValue(0);
      mockPrisma.translation.count.mockResolvedValue(0);
      mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: null } });

      const result = await adminService.getStats();

      expect(result.revenue).toBe(0);
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
