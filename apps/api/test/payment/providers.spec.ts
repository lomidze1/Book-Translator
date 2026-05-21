import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as crypto from 'crypto';
import { FlittProvider } from '../../src/payment/providers/flitt.provider';

// Lightweight ConfigService stand-in that mirrors process.env, so tests can
// drive provider behavior by setting env vars directly.
const envConfig = { get: (key: string) => process.env[key] } as any;

/**
 * Helper: replicate the Flitt SHA1 signature algorithm to generate valid
 * signatures for callback tests.
 */
function flittSignature(secret: string, params: Record<string, unknown>): string {
  const keys = Object.keys(params)
    .filter((k) => k !== 'signature' && k !== 'response_signature_string')
    .filter((k) => {
      const v = params[k];
      return v !== '' && v !== null && v !== undefined;
    })
    .sort();
  const values = keys.map((k) => String(params[k]));
  const payload = [secret, ...values].join('|');
  return crypto.createHash('sha1').update(payload, 'utf8').digest('hex');
}

describe('FlittProvider', () => {
  describe('mock mode (no credentials)', () => {
    let provider: FlittProvider;

    beforeEach(() => {
      delete process.env.FLITT_MERCHANT_ID;
      delete process.env.FLITT_SECRET_KEY;
      provider = new FlittProvider(envConfig);
    });

    it('should be in mock mode', () => {
      expect(provider.isMockMode()).toBe(true);
    });

    it('should return mock order with payment URL', async () => {
      const result = await provider.createOrder(10, 'GEL', 'Test', 'http://callback');

      expect(result.orderId).toMatch(/^bt_/);
      expect(result.paymentUrl).toContain('orderId=');
      expect(result.paymentUrl).toContain('amount=10');
      expect(result.paymentUrl).toContain('currency=GEL');
    });

    it('should accept callback and return COMPLETED status', () => {
      const result = provider.validateCallback({
        order_id: 'bt_123',
        order_status: 'approved',
        amount: 1000,
      });

      expect(result.orderId).toBe('bt_123');
      expect(result.status).toBe('COMPLETED');
      expect(result.amount).toBe(10); // 1000 minor units → 10 major
    });

    it('should return FAILED status when order_status is declined', () => {
      const result = provider.validateCallback({
        order_id: 'bt_123',
        order_status: 'declined',
        amount: 1000,
      });

      expect(result.status).toBe('FAILED');
    });
  });

  describe('real mode (with credentials)', () => {
    let provider: FlittProvider;
    const secret = 'test-flitt-secret';
    const merchantId = 1549901;

    beforeEach(() => {
      process.env.FLITT_MERCHANT_ID = String(merchantId);
      process.env.FLITT_SECRET_KEY = secret;
      provider = new FlittProvider(envConfig);
    });

    afterEach(() => {
      delete process.env.FLITT_MERCHANT_ID;
      delete process.env.FLITT_SECRET_KEY;
    });

    it('should not be in mock mode', () => {
      expect(provider.isMockMode()).toBe(false);
    });

    it('should reject callback without signature', () => {
      expect(() =>
        provider.validateCallback({ order_id: 'bt_1', order_status: 'approved', amount: 1000 }),
      ).toThrow('Missing Flitt callback signature');
    });

    it('should reject callback with invalid signature', () => {
      expect(() =>
        provider.validateCallback({
          order_id: 'bt_1',
          order_status: 'approved',
          amount: 1000,
          signature: '0000000000000000000000000000000000000000',
        }),
      ).toThrow('Invalid Flitt callback signature');
    });

    it('should accept callback with valid signature and map approved → COMPLETED', () => {
      const payload: Record<string, unknown> = {
        order_id: 'bt_ord_1',
        order_status: 'approved',
        amount: 1500,
        currency: 'GEL',
        payment_id: 'tx_42',
      };
      payload.signature = flittSignature(secret, payload);

      const result = provider.validateCallback(payload);

      expect(result.orderId).toBe('bt_ord_1');
      expect(result.transactionId).toBe('tx_42');
      expect(result.status).toBe('COMPLETED');
      expect(result.amount).toBe(15); // 1500 minor / 100
    });

    it('should map non-approved status to FAILED', () => {
      const payload: Record<string, unknown> = {
        order_id: 'bt_ord_1',
        order_status: 'declined',
        amount: 1500,
        payment_id: 'tx_42',
      };
      payload.signature = flittSignature(secret, payload);

      const result = provider.validateCallback(payload);
      expect(result.status).toBe('FAILED');
    });

    it('should reject callback when signature is computed without all fields', () => {
      // Attacker computes signature over partial payload, then adds extra fields
      const partial: Record<string, unknown> = { order_id: 'bt_1', order_status: 'approved' };
      const sig = flittSignature(secret, partial);
      const tampered = { ...partial, amount: 999999, signature: sig };

      expect(() => provider.validateCallback(tampered)).toThrow('Invalid Flitt callback signature');
    });

    it('should call Flitt checkout API and return checkout_url', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: {
              response_status: 'success',
              checkout_url: 'https://pay.flitt.com/merchants/1549901/default/index.html?token=xyz',
            },
          }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await provider.createOrder(10, 'GEL', 'Test Book', 'http://callback');

      expect(result.orderId).toMatch(/^bt_/);
      expect(result.paymentUrl).toBe('https://pay.flitt.com/merchants/1549901/default/index.html?token=xyz');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://pay.flitt.com/api/checkout/url',
        expect.objectContaining({ method: 'POST' }),
      );

      // Verify the request body contains a signature and uses minor units
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.request.merchant_id).toBe(merchantId);
      expect(body.request.amount).toBe(1000); // 10 GEL → 1000 tetri
      expect(body.request.currency).toBe('GEL');
      expect(typeof body.request.signature).toBe('string');
      expect(body.request.signature).toHaveLength(40); // SHA1 hex

      vi.unstubAllGlobals();
    });

    it('should throw when Flitt API returns failure response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: {
              response_status: 'failure',
              error_code: 1011,
              error_message: 'Invalid merchant',
            },
          }),
      }));

      await expect(
        provider.createOrder(10, 'GEL', 'Test', 'http://callback'),
      ).rejects.toThrow('Flitt payment failed');

      vi.unstubAllGlobals();
    });

    it('should throw on HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal error'),
      }));

      await expect(
        provider.createOrder(10, 'GEL', 'Test', 'http://callback'),
      ).rejects.toThrow('Flitt payment failed: 500');

      vi.unstubAllGlobals();
    });
  });
});
