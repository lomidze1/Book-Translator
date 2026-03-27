import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as crypto from 'crypto';
import { BogProvider } from '../../src/payment/providers/bog.provider';
import { TbcProvider } from '../../src/payment/providers/tbc.provider';

describe('BogProvider', () => {
  describe('mock mode (no credentials)', () => {
    let provider: BogProvider;

    beforeEach(() => {
      delete process.env.BOG_CLIENT_ID;
      delete process.env.BOG_CLIENT_SECRET;
      provider = new BogProvider();
    });

    it('should be in mock mode', () => {
      expect(provider.isMockMode()).toBe(true);
    });

    it('should return mock order with payment URL', async () => {
      const result = await provider.createOrder(10, 'GEL', 'Test', 'http://callback');

      expect(result.orderId).toMatch(/^bog_mock_/);
      expect(result.paymentUrl).toContain('orderId=');
      expect(result.paymentUrl).toContain('amount=10');
      expect(result.paymentUrl).toContain('currency=GEL');
    });

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

  describe('real mode (with credentials)', () => {
    let provider: BogProvider;
    const secret = 'test-bog-secret-key';

    beforeEach(() => {
      process.env.BOG_CLIENT_ID = 'test-client-id';
      process.env.BOG_CLIENT_SECRET = secret;
      provider = new BogProvider();
    });

    afterEach(() => {
      delete process.env.BOG_CLIENT_ID;
      delete process.env.BOG_CLIENT_SECRET;
    });

    it('should not be in mock mode', () => {
      expect(provider.isMockMode()).toBe(false);
    });

    it('should reject callback without signature', () => {
      expect(() =>
        provider.validateCallback({ order_id: 'test', status: 'success', amount: 10 }),
      ).toThrow('Missing BOG callback signature');
    });

    it('should reject callback with invalid signature', () => {
      expect(() =>
        provider.validateCallback(
          { order_id: 'test', status: 'success', amount: 10 },
          'invalid-signature',
        ),
      ).toThrow('Invalid BOG callback signature');
    });

    it('should accept callback with valid signature', () => {
      const payload = { order_id: 'ord-123', payment_id: 'tx-123', status: 'success', amount: 10 };
      const validSig = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      const result = provider.validateCallback(payload, validSig);

      expect(result.orderId).toBe('ord-123');
      expect(result.transactionId).toBe('tx-123');
      expect(result.status).toBe('COMPLETED');
      expect(result.amount).toBe(10);
    });

    it('should map non-success status to FAILED', () => {
      const payload = { order_id: 'ord-123', payment_id: 'tx-123', status: 'rejected', amount: 10 };
      const validSig = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      const result = provider.validateCallback(payload, validSig);
      expect(result.status).toBe('FAILED');
    });

    it('should call real API for createOrder', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ order_id: 'real-order', links: { redirect: 'https://pay.bog.ge/test' } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await provider.createOrder(10, 'GEL', 'Test Book', 'http://callback');

      expect(result.orderId).toBe('real-order');
      expect(result.paymentUrl).toBe('https://pay.bog.ge/test');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('ipay.ge'),
        expect.objectContaining({ method: 'POST' }),
      );

      vi.unstubAllGlobals();
    });

    it('should throw on API error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal error'),
      }));

      await expect(
        provider.createOrder(10, 'GEL', 'Test', 'http://callback'),
      ).rejects.toThrow('BOG payment failed: 500');

      vi.unstubAllGlobals();
    });
  });
});

describe('TbcProvider', () => {
  describe('mock mode (no credentials)', () => {
    let provider: TbcProvider;

    beforeEach(() => {
      delete process.env.TBC_API_KEY;
      delete process.env.TBC_API_SECRET;
      provider = new TbcProvider();
    });

    it('should be in mock mode', () => {
      expect(provider.isMockMode()).toBe(true);
    });

    it('should return mock order with payment URL', async () => {
      const result = await provider.createOrder(5, 'GEL', 'Test', 'http://callback');

      expect(result.orderId).toMatch(/^tbc_mock_/);
      expect(result.paymentUrl).toContain('orderId=');
      expect(result.paymentUrl).toContain('amount=5');
    });

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

  describe('real mode (with credentials)', () => {
    let provider: TbcProvider;
    const secret = 'test-tbc-secret-key';

    beforeEach(() => {
      process.env.TBC_API_KEY = 'test-api-key';
      process.env.TBC_API_SECRET = secret;
      provider = new TbcProvider();
    });

    afterEach(() => {
      delete process.env.TBC_API_KEY;
      delete process.env.TBC_API_SECRET;
    });

    it('should not be in mock mode', () => {
      expect(provider.isMockMode()).toBe(false);
    });

    it('should reject callback without signature', () => {
      expect(() =>
        provider.validateCallback({ PaymentId: 'test', Status: 'Succeeded', Amount: 5 }),
      ).toThrow('Missing TBC callback signature');
    });

    it('should reject callback with invalid signature', () => {
      expect(() =>
        provider.validateCallback(
          { PaymentId: 'test', Status: 'Succeeded', Amount: 5 },
          'invalid',
        ),
      ).toThrow('Invalid TBC callback signature');
    });

    it('should accept callback with valid signature', () => {
      const payload = { PaymentId: 'pay-123', TransactionId: 'tx-456', Status: 'Succeeded', Amount: 5 };
      const validSig = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      const result = provider.validateCallback(payload, validSig);

      expect(result.orderId).toBe('pay-123');
      expect(result.transactionId).toBe('tx-456');
      expect(result.status).toBe('COMPLETED');
      expect(result.amount).toBe(5);
    });

    it('should call real API for createOrder', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ payId: 'tbc-order', links: [null, { uri: 'https://pay.tbc.ge/test' }] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await provider.createOrder(5, 'GEL', 'Test Book', 'http://callback');

      expect(result.orderId).toBe('tbc-order');
      expect(result.paymentUrl).toBe('https://pay.tbc.ge/test');

      vi.unstubAllGlobals();
    });

    it('should throw on API error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
      }));

      await expect(
        provider.createOrder(5, 'GEL', 'Test', 'http://callback'),
      ).rejects.toThrow('TBC payment failed: 403');

      vi.unstubAllGlobals();
    });
  });
});
