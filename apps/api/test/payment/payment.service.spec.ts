import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentService } from '../../src/payment/payment.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

describe('PaymentService', () => {
  let service: PaymentService;
  let prisma: any;
  let config: any;
  let bogProvider: any;
  let tbcProvider: any;
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

    bogProvider = {
      createOrder: vi.fn().mockResolvedValue({
        orderId: 'bog_order_123',
        paymentUrl: 'https://ipay.ge/checkout/test',
      }),
      validateCallback: vi.fn().mockReturnValue({
        orderId: 'bog_order_123',
        transactionId: 'tx_123',
        status: 'COMPLETED',
        amount: 10,
      }),
    };

    tbcProvider = {
      createOrder: vi.fn().mockResolvedValue({
        orderId: 'tbc_order_123',
        paymentUrl: 'https://tbc.ge/pay/test',
      }),
      validateCallback: vi.fn().mockReturnValue({
        orderId: 'tbc_order_123',
        transactionId: 'tx_tbc_456',
        status: 'COMPLETED',
        amount: 5,
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
        return map[key] || undefined;
      }),
    };

    notificationService = {
      notify: vi.fn().mockResolvedValue(undefined),
    };

    service = new PaymentService(prisma, config, bogProvider, tbcProvider, translationService, notificationService);
  });

  describe('createPayment', () => {
    const userId = 'user-1';
    const bookId = 'book-1';

    beforeEach(() => {
      prisma.book.findUnique.mockResolvedValue({
        id: bookId,
        title: 'Test Book',
        userBooks: [{ userId }],
      });
      prisma.payment.findFirst.mockResolvedValue(null);
      prisma.payment.create.mockResolvedValue({
        id: 'pay-1',
        userId,
        amount: 10,
        currency: 'GEL',
        status: 'PENDING',
        type: 'TRANSLATION',
        provider: 'BOG',
      });
      prisma.payment.update.mockResolvedValue({ id: 'pay-1', status: 'PROCESSING' });
    });

    it('should create a payment with BOG provider', async () => {
      const result = await service.createPayment(userId, bookId, 'TRANSLATION', 'BOG', 'trans-1');

      expect(result.paymentId).toBe('pay-1');
      expect(result.paymentUrl).toBe('https://ipay.ge/checkout/test');
      expect(result.orderId).toBe('bog_order_123');
      expect(result.amount).toBe(10);
      expect(result.currency).toBe('GEL');
    });

    it('should create a payment with TBC provider', async () => {
      const result = await service.createPayment(userId, bookId, 'TRANSLATION', 'TBC', 'trans-1');

      expect(result.paymentUrl).toBe('https://tbc.ge/pay/test');
      expect(tbcProvider.createOrder).toHaveBeenCalled();
    });

    it('should throw NotFoundException if book not found', async () => {
      prisma.book.findUnique.mockResolvedValue(null);

      await expect(
        service.createPayment(userId, bookId, 'TRANSLATION', 'BOG'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own the book (TRANSLATION type)', async () => {
      prisma.book.findUnique.mockResolvedValue({
        id: bookId,
        title: 'Test Book',
        userBooks: [{ userId: 'other-user' }],
      });

      await expect(
        service.createPayment(userId, bookId, 'TRANSLATION', 'BOG'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should not check ownership for PURCHASE_ORIGINAL', async () => {
      prisma.book.findUnique.mockResolvedValue({
        id: bookId,
        title: 'Test Book',
        userBooks: [],
      });

      const result = await service.createPayment(userId, bookId, 'PURCHASE_ORIGINAL', 'BOG');
      expect(result.paymentId).toBe('pay-1');
    });

    it('should throw BadRequestException if pending payment exists', async () => {
      prisma.payment.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createPayment(userId, bookId, 'TRANSLATION', 'BOG'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set correct price for TRANSLATION type (10 GEL)', async () => {
      await service.createPayment(userId, bookId, 'TRANSLATION', 'BOG');

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 10, currency: 'GEL' }),
        }),
      );
    });

    it('should set correct price for PURCHASE_TRANSLATION type (5 GEL)', async () => {
      await service.createPayment(userId, bookId, 'PURCHASE_TRANSLATION', 'BOG');

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
        userBooks: [],
      });
      await service.createPayment(userId, bookId, 'PURCHASE_ORIGINAL', 'BOG');

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 1, currency: 'USD' }),
        }),
      );
    });

    it('should mark payment as FAILED if provider throws', async () => {
      bogProvider.createOrder.mockRejectedValue(new Error('Provider error'));

      await expect(
        service.createPayment(userId, bookId, 'TRANSLATION', 'BOG'),
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
        userBooks: [{ userId }],
      });

      await service.createPayment(userId, bookId, 'TRANSLATION', 'BOG');

      const callArgs = prisma.payment.create.mock.calls[0][0];
      expect(callArgs.data.description).not.toContain('\n');
      expect(callArgs.data.description.length).toBeLessThanOrEqual(220); // type + ": " + 200 chars
    });
  });

  describe('handleCallback', () => {
    const payload = { order_id: 'bog_order_123', status: 'success', amount: 10 };

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

    it('should process BOG callback and complete payment', async () => {
      const result = await service.handleCallback('BOG', payload);

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

    it('should process TBC callback', async () => {
      const tbcPayload = { PaymentId: 'tbc_order_123', Status: 'Succeeded', Amount: 5 };
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-2',
        userId: 'user-1',
        status: 'PROCESSING',
        type: 'PURCHASE_TRANSLATION',
        translationId: 'trans-2',
        amount: 5,
      });

      const result = await service.handleCallback('TBC', tbcPayload);
      expect(result.status).toBe('COMPLETED');
      expect(tbcProvider.validateCallback).toHaveBeenCalledWith(tbcPayload, undefined);
    });

    it('should update translation to PAID and start translation', async () => {
      await service.handleCallback('BOG', payload);

      expect(prisma.translation.update).toHaveBeenCalledWith({
        where: { id: 'trans-1' },
        data: { status: 'PAID' },
      });
      expect(translationService.startTranslation).toHaveBeenCalledWith('trans-1');
    });

    it('should throw NotFoundException if payment not found by orderId', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(
        service.handleCallback('BOG', payload),
      ).rejects.toThrow(NotFoundException);
    });

    it('should skip already completed payments', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        status: 'COMPLETED',
        type: 'TRANSLATION',
        amount: 10,
      });

      const result = await service.handleCallback('BOG', payload);
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

      const result = await service.handleCallback('BOG', payload);
      expect(result.status).toBe('FAILED');
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException on invalid signature', async () => {
      bogProvider.validateCallback.mockImplementation(() => {
        throw new Error('Invalid BOG callback signature');
      });

      await expect(
        service.handleCallback('BOG', payload, 'bad-sig'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should handle FAILED callback status', async () => {
      bogProvider.validateCallback.mockReturnValue({
        orderId: 'bog_order_123',
        transactionId: 'tx_123',
        status: 'FAILED',
        amount: 10,
      });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.handleCallback('BOG', payload);
      expect(result.status).toBe('FAILED');
      expect(translationService.startTranslation).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException on amount mismatch', async () => {
      bogProvider.validateCallback.mockReturnValue({
        orderId: 'bog_order_123',
        transactionId: 'tx_123',
        status: 'COMPLETED',
        amount: 5, // expected 10
      });

      await expect(
        service.handleCallback('BOG', payload),
      ).rejects.toThrow(BadRequestException);
    });

    it('should skip amount check when validation amount is 0', async () => {
      bogProvider.validateCallback.mockReturnValue({
        orderId: 'bog_order_123',
        transactionId: 'tx_123',
        status: 'COMPLETED',
        amount: 0, // no amount in callback
      });

      const result = await service.handleCallback('BOG', payload);
      expect(result.status).toBe('COMPLETED');
    });

    it('should handle concurrent callback (updateMany returns 0)', async () => {
      prisma.payment.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.handleCallback('BOG', payload);
      expect(result.status).toBe('PROCESSING');
      expect(translationService.startTranslation).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for unknown provider', async () => {
      await expect(
        service.handleCallback('UNKNOWN' as any, payload),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create userBook on PURCHASE_TRANSLATION completion', async () => {
      bogProvider.validateCallback.mockReturnValue({
        orderId: 'bog_order_123',
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

      await service.handleCallback('BOG', payload);

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
      bogProvider.validateCallback.mockReturnValue({
        orderId: 'bog_order_123',
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

      await service.handleCallback('BOG', payload);

      expect(prisma.userBook.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ type: 'PURCHASED_ORIGINAL' }),
        }),
      );
    });

    it('should skip userBook creation when translationId is null for PURCHASE type', async () => {
      bogProvider.validateCallback.mockReturnValue({
        orderId: 'bog_order_123',
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

      await service.handleCallback('BOG', payload);

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
    it('should block in production', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await expect(
        service.simulatePayment('pay-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);

      process.env.NODE_ENV = origEnv;
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
