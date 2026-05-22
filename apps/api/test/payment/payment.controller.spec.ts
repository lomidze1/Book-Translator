import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { PaymentController } from '../../src/payment/payment.controller';
import { FlittCallbackDto } from '../../src/payment/dto';

describe('PaymentController', () => {
  let controller: PaymentController;
  let paymentService: any;
  let config: any;

  beforeEach(() => {
    paymentService = {
      createPayment: vi.fn().mockResolvedValue({
        paymentId: 'pay-1',
        paymentUrl: 'https://pay.test',
        orderId: 'order-1',
        amount: 10,
        currency: 'GEL',
      }),
      getPaymentHistory: vi.fn().mockResolvedValue({
        payments: [],
        total: 0,
        page: 1,
        limit: 20,
      }),
      getPaymentById: vi.fn().mockResolvedValue({ id: 'pay-1' }),
      simulatePayment: vi.fn().mockResolvedValue({ status: 'COMPLETED' }),
      handleCallback: vi.fn().mockResolvedValue({ status: 'COMPLETED' }),
    };

    config = { get: (k: string) => process.env[k] };
    controller = new PaymentController(paymentService, config as any);
  });

  describe('create', () => {
    it('should call createPayment with correct params', async () => {
      const dto = {
        bookId: 'book-1',
        type: 'TRANSLATION' as const,
        provider: 'FLITT' as const,
        translationId: 'trans-1',
        translationType: 'FAST' as const,
      };

      await controller.create(dto, 'user-1');

      expect(paymentService.createPayment).toHaveBeenCalledWith(
        'user-1', 'book-1', 'TRANSLATION', 'FLITT', 'trans-1', 'FAST',
      );
    });
  });

  describe('getHistory', () => {
    it('should call getPaymentHistory with pagination', async () => {
      await controller.getHistory('user-1', 2, 10);

      expect(paymentService.getPaymentHistory).toHaveBeenCalledWith('user-1', 2, 10);
    });
  });

  describe('getPayment', () => {
    it('should call getPaymentById', async () => {
      await controller.getPayment('pay-1', 'user-1');

      expect(paymentService.getPaymentById).toHaveBeenCalledWith('pay-1', 'user-1');
    });
  });

  describe('simulate', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDevShortcuts = process.env.ENABLE_DEV_SHORTCUTS;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      if (originalDevShortcuts === undefined) {
        delete process.env.ENABLE_DEV_SHORTCUTS;
      } else {
        process.env.ENABLE_DEV_SHORTCUTS = originalDevShortcuts;
      }
    });

    it('should call simulatePayment when dev shortcuts are enabled', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ENABLE_DEV_SHORTCUTS = 'true';
      await controller.simulate('pay-1', 'user-1');

      expect(paymentService.simulatePayment).toHaveBeenCalledWith('pay-1', 'user-1');
    });

    it('should throw ForbiddenException in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_DEV_SHORTCUTS = 'true'; // even with this set, prod must refuse

      await expect(controller.simulate('pay-1', 'user-1')).rejects.toThrow(ForbiddenException);
      expect(paymentService.simulatePayment).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if ENABLE_DEV_SHORTCUTS is missing', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.ENABLE_DEV_SHORTCUTS;

      await expect(controller.simulate('pay-1', 'user-1')).rejects.toThrow(ForbiddenException);
      expect(paymentService.simulatePayment).not.toHaveBeenCalled();
    });
  });

  describe('flittCallback', () => {
    it('should handle Flitt callback', async () => {
      const payload = { order_id: 'bt_1', order_status: 'approved', signature: 'sig-abc' } as any;

      await controller.flittCallback(payload);

      expect(paymentService.handleCallback).toHaveBeenCalledWith('FLITT', payload);
    });
  });

  // Regression: the global ValidationPipe used to strip non-whitelisted fields,
  // which broke signature verification on real webhooks. The webhook route must
  // preserve the full payload so the SHA1 signature can be recomputed.
  describe('webhook payload preservation', () => {
    it('keeps extra Flitt fields after validation', async () => {
      const pipe = new ValidationPipe({ whitelist: false, forbidNonWhitelisted: false, transform: true });
      const input = {
        order_id: 'bt_1',
        order_status: 'approved',
        signature: 'abc123',
        amount: 1000,
        currency: 'GEL',
        payment_id: 'p-1',
        masked_card: '4111****1111',
      };

      const result = await pipe.transform(input, { type: 'body', metatype: FlittCallbackDto });

      expect(result.order_id).toBe('bt_1');
      expect(result.order_status).toBe('approved');
      expect(result.signature).toBe('abc123');
      expect((result as any).amount).toBe(1000);
      expect((result as any).currency).toBe('GEL');
      expect((result as any).payment_id).toBe('p-1');
      expect((result as any).masked_card).toBe('4111****1111');
    });
  });
});
