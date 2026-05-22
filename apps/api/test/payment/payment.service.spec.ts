import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PaymentService } from '../../src/payment/payment.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

describe('PaymentService', () => {
  let service: PaymentService;
  let prisma: any;
  let config: any;
  let flittProvider: any;
  let translationService: any;
  let notificationService: any;

  beforeEach(() => {
    prisma = {
      book: { findUnique: vi.fn() },
      payment: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
      translation: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      userBook: { upsert: vi.fn() },
    };

    flittProvider = {
      createOrder: vi.fn().mockResolvedValue({
        orderId: 'bt_order_123',
        paymentUrl: 'https://pay.flitt.com/merchants/1/default/index.html?token=xyz',
      }),
      validateCallback: vi.fn().mockReturnValue({
        orderId: 'bt_order_123',
        transactionId: 'tx_123',
        status: 'COMPLETED',
        amount: 10,
      }),
    };

    translationService = {
      startTranslation: vi.fn().mockResolvedValue({}),
    };

    config = {
      get: vi.fn((key: string) => {
        const map: Record<string, string> = {
          PRICE_PER_PAGE_FAST: '0.15',
          PRICE_PER_PAGE_SLOW: '0.07',
          PRICE_MIN: '10',
          PRICE_EXISTING: '5',
          PRICE_CURRENCY: 'GEL',
        };
        // Fall through to process.env for env-driven values like NODE_ENV.
        return map[key] ?? process.env[key];
      }),
    };

    notificationService = {
      notify: vi.fn().mockResolvedValue(undefined),
    };

    service = new PaymentService(prisma, config, flittProvider, translationService, notificationService);
  });

  describe('createPayment', () => {
    const userId = 'user-1';
    const bookId = 'book-1';

    beforeEach(() => {
      prisma.book.findUnique.mockResolvedValue({
        id: bookId,
        title: 'Test Book',
        // 50 pages × 0.15 FAST = 7.5 → clamped up to PRICE_MIN (10) for the
        // legacy "10 GEL" assertions.
        pageCount: 50,
        userBooks: [{ userId }],
        chapters: [],
      });
      prisma.payment.findFirst.mockResolvedValue(null);
      prisma.payment.create.mockResolvedValue({
        id: 'pay-1',
        userId,
        amount: 10,
        currency: 'GEL',
        status: 'PENDING',
        type: 'TRANSLATION',
        provider: 'FLITT',
      });
      prisma.payment.update.mockResolvedValue({ id: 'pay-1', status: 'PROCESSING' });
    });

    it('should create a payment with Flitt provider', async () => {
      const result = await service.createPayment(userId, bookId, 'TRANSLATION', 'FLITT', 'trans-1', 'FAST');

      expect(result.paymentId).toBe('pay-1');
      expect(result.paymentUrl).toBe('https://pay.flitt.com/merchants/1/default/index.html?token=xyz');
      expect(result.orderId).toBe('bt_order_123');
      expect(result.amount).toBe(10);
      expect(result.currency).toBe('GEL');
    });

    it('should throw NotFoundException if book not found', async () => {
      prisma.book.findUnique.mockResolvedValue(null);

      await expect(
        service.createPayment(userId, bookId, 'TRANSLATION', 'FLITT', undefined, 'FAST'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own the book (TRANSLATION type)', async () => {
      prisma.book.findUnique.mockResolvedValue({
        id: bookId,
        title: 'Test Book',
        pageCount: 50,
        userBooks: [{ userId: 'other-user' }],
        chapters: [],
      });

      await expect(
        service.createPayment(userId, bookId, 'TRANSLATION', 'FLITT', undefined, 'FAST'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should not check ownership for PURCHASE_ORIGINAL', async () => {
      prisma.book.findUnique.mockResolvedValue({
        id: bookId,
        title: 'Test Book',
        pageCount: 50,
        userBooks: [],
        chapters: [],
      });

      const result = await service.createPayment(userId, bookId, 'PURCHASE_ORIGINAL', 'FLITT');
      expect(result.paymentId).toBe('pay-1');
    });

    it('should throw BadRequestException if pending payment exists', async () => {
      prisma.payment.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createPayment(userId, bookId, 'TRANSLATION', 'FLITT', undefined, 'FAST'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for TRANSLATION without translationType', async () => {
      // Regression for the PRICE_MIN-fallback bug: server must reject the
      // request rather than silently bill the minimum price.
      await expect(
        service.createPayment(userId, bookId, 'TRANSLATION', 'FLITT'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set correct price for TRANSLATION type (10 GEL with 50 pages × FAST)', async () => {
      await service.createPayment(userId, bookId, 'TRANSLATION', 'FLITT', undefined, 'FAST');

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 10, currency: 'GEL' }),
        }),
      );
    });

    it('should set correct price for PURCHASE_TRANSLATION type (5 GEL)', async () => {
      await service.createPayment(userId, bookId, 'PURCHASE_TRANSLATION', 'FLITT');

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 5, currency: 'GEL' }),
        }),
      );
    });

    it('should set correct price for PURCHASE_ORIGINAL type (1 USD)', async () => {
      prisma.book.findUnique.mockResolvedValue({
        id: bookId,
        title: 'Test Book',
        pageCount: 50,
        userBooks: [],
        chapters: [],
      });
      await service.createPayment(userId, bookId, 'PURCHASE_ORIGINAL', 'FLITT');

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 1, currency: 'USD' }),
        }),
      );
    });

    it('should mark payment as FAILED if provider throws', async () => {
      flittProvider.createOrder.mockRejectedValue(new Error('Provider error'));

      await expect(
        service.createPayment(userId, bookId, 'TRANSLATION', 'FLITT', undefined, 'FAST'),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'FAILED' },
        }),
      );
    });

    it('should sanitize book title in description', async () => {
      prisma.book.findUnique.mockResolvedValue({
        id: bookId,
        title: 'Title\nWith\rNewlines' + 'x'.repeat(300),
        pageCount: 50,
        userBooks: [{ userId }],
        chapters: [],
      });

      await service.createPayment(userId, bookId, 'TRANSLATION', 'FLITT', undefined, 'FAST');

      const callArgs = prisma.payment.create.mock.calls[0][0];
      expect(callArgs.data.description).not.toContain('\n');
      expect(callArgs.data.description.length).toBeLessThanOrEqual(220);
    });

    it('should build callback URL pointing at the Flitt route', async () => {
      await service.createPayment(userId, bookId, 'TRANSLATION', 'FLITT', undefined, 'FAST');

      const callbackArg = flittProvider.createOrder.mock.calls[0][3];
      expect(callbackArg).toContain('/api/payments/flitt/callback');
    });
  });

  describe('handleCallback', () => {
    const payload = {
      order_id: 'bt_order_123',
      order_status: 'approved',
      amount: 1000,
      signature: 'deadbeef',
    };

    beforeEach(() => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        userId: 'user-1',
        status: 'PROCESSING',
        type: 'TRANSLATION',
        translationId: 'trans-1',
        amount: 10,
      });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      prisma.translation.update.mockResolvedValue({});
    });

    it('should process Flitt callback and complete payment', async () => {
      const result = await service.handleCallback('FLITT', payload);

      expect(result.status).toBe('COMPLETED');
      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'pay-1',
            status: { in: ['PENDING', 'PROCESSING'] },
          }),
        }),
      );
    });

    it('should update translation to PAID and start translation', async () => {
      await service.handleCallback('FLITT', payload);

      expect(prisma.translation.update).toHaveBeenCalledWith({
        where: { id: 'trans-1' },
        data: { status: 'PAID' },
      });
      expect(translationService.startTranslation).toHaveBeenCalledWith('trans-1');
    });

    it('should throw NotFoundException if payment not found by orderId', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(
        service.handleCallback('FLITT', payload),
      ).rejects.toThrow(NotFoundException);
    });

    it('should skip already completed payments', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        status: 'COMPLETED',
        type: 'TRANSLATION',
        amount: 10,
      });

      const result = await service.handleCallback('FLITT', payload);
      expect(result.status).toBe('COMPLETED');
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('should skip already failed payments', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        status: 'FAILED',
        type: 'TRANSLATION',
        amount: 10,
      });

      const result = await service.handleCallback('FLITT', payload);
      expect(result.status).toBe('FAILED');
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException on invalid signature', async () => {
      flittProvider.validateCallback.mockImplementation(() => {
        throw new Error('Invalid Flitt callback signature');
      });

      await expect(
        service.handleCallback('FLITT', payload),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should handle FAILED callback status', async () => {
      flittProvider.validateCallback.mockReturnValue({
        orderId: 'bt_order_123',
        transactionId: 'tx_123',
        status: 'FAILED',
        amount: 10,
      });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.handleCallback('FLITT', payload);
      expect(result.status).toBe('FAILED');
      expect(translationService.startTranslation).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException on amount mismatch', async () => {
      flittProvider.validateCallback.mockReturnValue({
        orderId: 'bt_order_123',
        transactionId: 'tx_123',
        status: 'COMPLETED',
        amount: 5, // expected 10
      });

      await expect(
        service.handleCallback('FLITT', payload),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject zero-amount callback when expected amount is non-zero', async () => {
      flittProvider.validateCallback.mockReturnValue({
        orderId: 'bt_order_123',
        transactionId: 'tx_123',
        status: 'COMPLETED',
        amount: 0,
      });

      await expect(
        service.handleCallback('FLITT', payload),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle concurrent callback (updateMany returns 0)', async () => {
      prisma.payment.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.handleCallback('FLITT', payload);
      expect(result.status).toBe('PROCESSING');
      expect(translationService.startTranslation).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for unknown provider', async () => {
      await expect(
        service.handleCallback('UNKNOWN' as any, payload),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create userBook on PURCHASE_TRANSLATION completion', async () => {
      flittProvider.validateCallback.mockReturnValue({
        orderId: 'bt_order_123',
        transactionId: 'tx_123',
        status: 'COMPLETED',
        amount: 5,
      });
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        userId: 'user-1',
        status: 'PROCESSING',
        type: 'PURCHASE_TRANSLATION',
        translationId: 'trans-1',
        amount: 5,
      });
      prisma.translation.findUnique.mockResolvedValue({ bookId: 'book-1' });

      await service.handleCallback('FLITT', payload);

      expect(prisma.userBook.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_bookId_type: {
              userId: 'user-1',
              bookId: 'book-1',
              type: 'PURCHASED_TRANSLATION',
            },
          },
        }),
      );
    });

    it('should create userBook on PURCHASE_ORIGINAL completion', async () => {
      flittProvider.validateCallback.mockReturnValue({
        orderId: 'bt_order_123',
        transactionId: 'tx_123',
        status: 'COMPLETED',
        amount: 1,
      });
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        userId: 'user-1',
        status: 'PROCESSING',
        type: 'PURCHASE_ORIGINAL',
        translationId: 'trans-1',
        amount: 1,
      });
      prisma.translation.findUnique.mockResolvedValue({ bookId: 'book-1' });

      await service.handleCallback('FLITT', payload);

      expect(prisma.userBook.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ type: 'PURCHASED_ORIGINAL' }),
        }),
      );
    });

    it('should skip userBook creation when translationId is null for PURCHASE type', async () => {
      flittProvider.validateCallback.mockReturnValue({
        orderId: 'bt_order_123',
        transactionId: 'tx_123',
        status: 'COMPLETED',
        amount: 5,
      });
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        userId: 'user-1',
        status: 'PROCESSING',
        type: 'PURCHASE_TRANSLATION',
        translationId: null,
        amount: 5,
      });

      await service.handleCallback('FLITT', payload);

      expect(prisma.userBook.upsert).not.toHaveBeenCalled();
    });
  });

  describe('getPaymentHistory', () => {
    it('should return paginated payments', async () => {
      prisma.payment.findMany.mockResolvedValue([{ id: 'pay-1' }]);
      prisma.payment.count.mockResolvedValue(1);

      const result = await service.getPaymentHistory('user-1', 1, 20);

      expect(result.payments).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('should calculate skip correctly for page 2', async () => {
      prisma.payment.findMany.mockResolvedValue([]);
      prisma.payment.count.mockResolvedValue(30);

      await service.getPaymentHistory('user-1', 2, 10);

      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('should clamp limit to max 100', async () => {
      prisma.payment.findMany.mockResolvedValue([]);
      prisma.payment.count.mockResolvedValue(0);

      const result = await service.getPaymentHistory('user-1', 1, 500);
      expect(result.limit).toBe(100);
    });

    it('should handle page 0 and negative values', async () => {
      prisma.payment.findMany.mockResolvedValue([]);
      prisma.payment.count.mockResolvedValue(0);

      const result = await service.getPaymentHistory('user-1', 0, -5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(1);
    });
  });

  describe('getPaymentById', () => {
    it('should return payment for owner', async () => {
      prisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', userId: 'user-1' });

      const result = await service.getPaymentById('pay-1', 'user-1');
      expect(result.id).toBe('pay-1');
    });

    it('should throw NotFoundException if payment does not exist', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(
        service.getPaymentById('pay-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own payment', async () => {
      prisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', userId: 'other-user' });

      await expect(
        service.getPaymentById('pay-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('simulatePayment', () => {
    const origEnv = process.env.NODE_ENV;
    const origShortcuts = process.env.ENABLE_DEV_SHORTCUTS;

    beforeEach(() => {
      // simulatePayment now requires both env vars (see common/dev-shortcuts.ts).
      process.env.NODE_ENV = 'development';
      process.env.ENABLE_DEV_SHORTCUTS = 'true';
    });

    afterEach(() => {
      process.env.NODE_ENV = origEnv;
      if (origShortcuts === undefined) {
        delete process.env.ENABLE_DEV_SHORTCUTS;
      } else {
        process.env.ENABLE_DEV_SHORTCUTS = origShortcuts;
      }
    });

    it('should block in production', async () => {
      process.env.NODE_ENV = 'production';

      await expect(
        service.simulatePayment('pay-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block when ENABLE_DEV_SHORTCUTS is missing', async () => {
      delete process.env.ENABLE_DEV_SHORTCUTS;

      await expect(
        service.simulatePayment('pay-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should simulate successful payment', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        userId: 'user-1',
        status: 'PENDING',
        type: 'TRANSLATION',
        translationId: 'trans-1',
      });
      prisma.payment.update.mockResolvedValue({
        id: 'pay-1',
        userId: 'user-1',
        status: 'COMPLETED',
        type: 'TRANSLATION',
        translationId: 'trans-1',
      });
      prisma.translation.update.mockResolvedValue({});

      const result = await service.simulatePayment('pay-1', 'user-1');
      expect(result.status).toBe('COMPLETED');
    });

    it('should simulate PROCESSING payment', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        userId: 'user-1',
        status: 'PROCESSING',
        type: 'TRANSLATION',
        translationId: null,
      });
      prisma.payment.update.mockResolvedValue({
        id: 'pay-1',
        userId: 'user-1',
        status: 'COMPLETED',
        type: 'TRANSLATION',
        translationId: null,
      });

      const result = await service.simulatePayment('pay-1', 'user-1');
      expect(result.status).toBe('COMPLETED');
    });

    it('should throw if payment not found', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(
        service.simulatePayment('pay-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if not owner', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        userId: 'other-user',
        status: 'PENDING',
      });

      await expect(
        service.simulatePayment('pay-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if payment already COMPLETED', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        userId: 'user-1',
        status: 'COMPLETED',
      });

      await expect(
        service.simulatePayment('pay-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if payment already FAILED', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        userId: 'user-1',
        status: 'FAILED',
      });

      await expect(
        service.simulatePayment('pay-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
