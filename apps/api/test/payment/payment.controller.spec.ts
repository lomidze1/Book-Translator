import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { PaymentController } from '../../src/payment/payment.controller';
import { PaymentService } from '../../src/payment/payment.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';

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

  // Regression: the global ValidationPipe (whitelist + forbidNonWhitelisted,
  // as configured in main.ts) runs BEFORE any per-route pipe, so a @UsePipes
  // override could not stop it from 400-ing real Flitt payloads that carry
  // extra fields. The route now takes a plain object body, which ValidationPipe
  // skips. This test boots a real Nest app with the same global pipe as main.ts
  // to prove the full payload reaches PaymentService.handleCallback.
  describe('webhook payload preservation (with global ValidationPipe)', () => {
    it('accepts extra Flitt fields and passes the full payload to the service', async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [PaymentController],
        providers: [
          { provide: PaymentService, useValue: paymentService },
          { provide: ConfigService, useValue: config },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => true })
        .compile();

      const app = moduleRef.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();

      const payload = {
        order_id: 'bt_1',
        order_status: 'approved',
        signature: 'abc123',
        amount: 1000,
        currency: 'GEL',
        payment_id: 'p-1',
        merchant_id: 1396424,
        response_status: 'success',
        masked_card: '4111****1111',
      };

      try {
        await request(app.getHttpServer())
          .post('/payments/flitt/callback')
          .send(payload)
          .expect(201);

        expect(paymentService.handleCallback).toHaveBeenCalledWith('FLITT', payload);
      } finally {
        await app.close();
      }
    });
  });
});
