import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentController } from '../../src/payment/payment.controller';

describe('PaymentController', () => {
  let controller: PaymentController;
  let paymentService: any;

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

    controller = new PaymentController(paymentService);
  });

  describe('create', () => {
    it('should call createPayment with correct params', async () => {
      const dto = {
        bookId: 'book-1',
        type: 'TRANSLATION' as const,
        provider: 'BOG' as const,
        translationId: 'trans-1',
      };

      await controller.create(dto, 'user-1');

      expect(paymentService.createPayment).toHaveBeenCalledWith(
        'user-1', 'book-1', 'TRANSLATION', 'BOG', 'trans-1',
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
    it('should call simulatePayment', async () => {
      await controller.simulate('pay-1', 'user-1');

      expect(paymentService.simulatePayment).toHaveBeenCalledWith('pay-1', 'user-1');
    });
  });

  describe('bogCallback', () => {
    it('should handle BOG callback', async () => {
      const payload = { order_id: 'test', status: 'success' };

      await controller.bogCallback(payload, 'sig-123');

      expect(paymentService.handleCallback).toHaveBeenCalledWith('BOG', payload, 'sig-123');
    });
  });

  describe('tbcCallback', () => {
    it('should handle TBC callback', async () => {
      const payload = { PaymentId: 'test', Status: 'Succeeded' };

      await controller.tbcCallback(payload, 'sig-456');

      expect(paymentService.handleCallback).toHaveBeenCalledWith('TBC', payload, 'sig-456');
    });
  });
});
