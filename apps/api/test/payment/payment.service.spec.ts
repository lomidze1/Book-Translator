import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentService } from '../../src/payment/payment.service';
import { BogProvider } from '../../src/payment/providers/bog.provider';
import { TbcProvider } from '../../src/payment/providers/tbc.provider';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

describe('PaymentService', () => {
  let service: PaymentService;
  let prisma: any;
  let bogProvider: any;
  let tbcProvider: any;
  let translationService: any;

  beforeEach(() => {
    prisma = {
      book: { findUnique: vi.fn() },
      payment: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
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
      validateCallback: vi.fn(),
    };

    translationService = {
      startTranslation: vi.fn().mockResolvedValue({}),
    };

    service = new PaymentService(prisma, bogProvider, tbcProvider, translationService);
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
      prisma.payment.update.mockResolvedValue({
        id: 'pay-1',
        status: 'PROCESSING',
      });
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

    it('should set correct price for TRANSLATION type', async () => {
      await service.createPayment(userId, bookId, 'TRANSLATION', 'BOG');

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 10, currency: 'GEL' }),
        }),
      );
    });

    it('should set correct price for PURCHASE_TRANSLATION type', async () => {
      await service.createPayment(userId, bookId, 'PURCHASE_TRANSLATION', 'BOG');

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 5, currency: 'GEL' }),
        }),
      );
    });

    it('should set correct price for PURCHASE_ORIGINAL type', async () => {
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
  });

  describe('handleCallback', () => {
    const payload = { order_id: 'bog_order_123', status: 'success', amount: 10 };

    beforeEach(() => {
      prisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        userId: 'user-1',
        status: 'PROCESSING',
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
    });

    it('should process BOG callback and complete payment', async () => {
      const result = await service.handleCallback('BOG', payload);

      expect(result.status).toBe('COMPLETED');
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('should update translation to PAID and start translation on TRANSLATION type', async () => {
      await service.handleCallback('BOG', payload);

      expect(prisma.translation.update).toHaveBeenCalledWith({
        where: { id: 'trans-1' },
        data: { status: 'PAID' },
      });
      expect(translationService.startTranslation).toHaveBeenCalledWith('trans-1');
    });

    it('should throw NotFoundException if payment not found by orderId', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(
        service.handleCallback('BOG', payload),
      ).rejects.toThrow(NotFoundException);
    });

    it('should skip already completed payments', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        status: 'COMPLETED',
        type: 'TRANSLATION',
      });

      const result = await service.handleCallback('BOG', payload);
      expect(result.status).toBe('COMPLETED');
      expect(prisma.payment.update).not.toHaveBeenCalled();
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
      prisma.payment.update.mockResolvedValue({
        id: 'pay-1',
        status: 'FAILED',
        type: 'TRANSLATION',
        translationId: 'trans-1',
      });

      const result = await service.handleCallback('BOG', payload);
      expect(result.status).toBe('FAILED');
      expect(translationService.startTranslation).not.toHaveBeenCalled();
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
  });

  describe('getPaymentById', () => {
    it('should return payment for owner', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        userId: 'user-1',
      });

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
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        userId: 'other-user',
      });

      await expect(
        service.getPaymentById('pay-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('simulatePayment', () => {
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

    it('should throw if payment already completed', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        userId: 'user-1',
        status: 'COMPLETED',
      });

      await expect(
        service.simulatePayment('pay-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
