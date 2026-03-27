import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BogProvider } from '../../src/payment/providers/bog.provider';
import { TbcProvider } from '../../src/payment/providers/tbc.provider';

describe('BogProvider', () => {
  let provider: BogProvider;

  beforeEach(() => {
    // No credentials — mock mode
    delete process.env.BOG_CLIENT_ID;
    delete process.env.BOG_CLIENT_SECRET;
    provider = new BogProvider();
  });

  describe('createOrder (mock mode)', () => {
    it('should return mock order with payment URL', async () => {
      const result = await provider.createOrder(10, 'GEL', 'Test', 'http://callback');

      expect(result.orderId).toMatch(/^bog_mock_/);
      expect(result.paymentUrl).toContain('orderId=');
      expect(result.paymentUrl).toContain('amount=10');
      expect(result.paymentUrl).toContain('currency=GEL');
    });
  });

  describe('validateCallback (mock mode)', () => {
    it('should accept callback and return COMPLETED status', () => {
      const result = provider.validateCallback({
        order_id: 'bog_mock_123',
        status: 'success',
        amount: 10,
      });

      expect(result.orderId).toBe('bog_mock_123');
      expect(result.status).toBe('COMPLETED');
      expect(result.amount).toBe(10);
    });

    it('should return FAILED status when status is FAILED', () => {
      const result = provider.validateCallback({
        order_id: 'bog_mock_123',
        status: 'FAILED',
        amount: 10,
      });

      expect(result.status).toBe('FAILED');
    });
  });
});

describe('TbcProvider', () => {
  let provider: TbcProvider;

  beforeEach(() => {
    delete process.env.TBC_API_KEY;
    delete process.env.TBC_API_SECRET;
    provider = new TbcProvider();
  });

  describe('createOrder (mock mode)', () => {
    it('should return mock order with payment URL', async () => {
      const result = await provider.createOrder(5, 'GEL', 'Test', 'http://callback');

      expect(result.orderId).toMatch(/^tbc_mock_/);
      expect(result.paymentUrl).toContain('orderId=');
      expect(result.paymentUrl).toContain('amount=5');
    });
  });

  describe('validateCallback (mock mode)', () => {
    it('should accept callback and return COMPLETED status', () => {
      const result = provider.validateCallback({
        PaymentId: 'tbc_mock_123',
        Status: 'Succeeded',
        Amount: 5,
      });

      expect(result.orderId).toBe('tbc_mock_123');
      expect(result.status).toBe('COMPLETED');
      expect(result.amount).toBe(5);
    });

    it('should return FAILED status', () => {
      const result = provider.validateCallback({
        PaymentId: 'tbc_mock_123',
        Status: 'Failed',
        Amount: 5,
      });

      expect(result.status).toBe('FAILED');
    });
  });
});
