import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PaymentProviderInterface, PaymentResult, CallbackValidation } from './payment-provider.interface';
import { fetchWithTimeout } from '../../common/fetch';

const FLITT_CHECKOUT_URL = 'https://pay.flitt.com/api/checkout/url';

/**
 * Flitt payment provider (TBC Bank subsidiary).
 * Docs: https://docs.flitt.com/getting-started/redirect
 *
 * Signature: SHA1 of `secret_key|<value1>|<value2>|...` where values are
 * non-empty request/response params sorted alphabetically by key. The
 * `signature` field itself is excluded.
 */
@Injectable()
export class FlittProvider implements PaymentProviderInterface {
  private readonly logger = new Logger(FlittProvider.name);
  private readonly merchantId: number | null;
  private readonly secretKey: string | null;
  private readonly frontendUrl: string;
  private readonly isProduction: boolean;

  constructor(private readonly config: ConfigService) {
    const merchantIdRaw = this.config.get<string>('FLITT_MERCHANT_ID');
    this.merchantId = merchantIdRaw ? parseInt(merchantIdRaw, 10) : null;
    this.secretKey = this.config.get<string>('FLITT_SECRET_KEY') || null;
    this.frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    this.isProduction = this.config.get<string>('NODE_ENV') === 'production';

    if (!this.merchantId || !this.secretKey) {
      this.logger.warn('Flitt credentials not set — using mock mode');
    }
  }

  isMockMode(): boolean {
    if (this.isProduction && (!this.merchantId || !this.secretKey)) {
      throw new Error('Flitt credentials are required in production');
    }
    return !this.merchantId || !this.secretKey;
  }

  /**
   * Compute Flitt SHA1 signature over the given params.
   * - Excludes the `signature` field itself.
   * - Skips empty / null / undefined values (numeric 0 is kept).
   * - Sorts keys alphabetically.
   * - Joins values with `|`, prepended by the secret key.
   */
  private buildSignature(params: Record<string, unknown>): string {
    if (!this.secretKey) throw new Error('Flitt secret key not configured');

    const keys = Object.keys(params)
      .filter((k) => k !== 'signature' && k !== 'response_signature_string')
      .filter((k) => {
        const v = params[k];
        if (v === '' || v === null || v === undefined) return false;
        return true;
      })
      .sort();

    const values = keys.map((k) => String(params[k]));
    const payload = [this.secretKey, ...values].join('|');
    return crypto.createHash('sha1').update(payload, 'utf8').digest('hex');
  }

  async createOrder(
    amount: number,
    currency: string,
    description: string,
    callbackUrl: string,
  ): Promise<PaymentResult> {
    // Flitt expects amount in the smallest currency unit (e.g., tetri for GEL).
    const amountMinor = Math.round(amount * 100);
    const orderId = `bt_${crypto.randomUUID()}`;

    // Mock mode when no credentials
    if (this.isMockMode()) {
      this.logger.warn(`Mock Flitt order created: ${orderId} — ${amount} ${currency}`);
      return {
        orderId,
        paymentUrl: `${this.frontendUrl}/payment/mock?orderId=${orderId}&amount=${amount}&currency=${currency}`,
      };
    }

    // Defense in depth: strip control characters before shipping to Flitt.
    // payment.service already strips \n\r from book titles, but a malicious
    // upload could still slip in other ASCII control chars (\x00..\x1f, \x7f)
    // that could confuse Flitt's request parser or downstream invoicing.
    // The control chars in the regex are intentional — that's the whole point
    // of the rule we're trying to match.
    // eslint-disable-next-line no-control-regex
    const sanitizedDesc = description.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 1024);

    const requestParams: Record<string, unknown> = {
      merchant_id: this.merchantId!,
      order_id: orderId,
      amount: amountMinor,
      currency,
      order_desc: sanitizedDesc,
      server_callback_url: callbackUrl,
      response_url: `${this.frontendUrl}/payment/success?order=${orderId}`,
    };

    const signedRequest = {
      ...requestParams,
      signature: this.buildSignature(requestParams),
    };

    const response = await fetchWithTimeout(
      FLITT_CHECKOUT_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: signedRequest }),
      },
      15_000,
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      this.logger.error(`Flitt order creation failed: ${response.status} — ${errorText.slice(0, 500)}`);
      throw new Error(`Flitt payment failed: ${response.status}`);
    }

    const body = (await response.json()) as { response?: { response_status?: string; checkout_url?: string; error_message?: string; error_code?: string | number } };
    const result = body.response;

    if (!result || result.response_status !== 'success' || !result.checkout_url) {
      this.logger.error(
        `Flitt order rejected: ${result?.error_code} — ${result?.error_message?.slice(0, 500)}`,
      );
      throw new Error(`Flitt payment failed: ${result?.error_message || 'unknown error'}`);
    }

    return { orderId, paymentUrl: result.checkout_url };
  }

  /**
   * Flitt sends the callback as JSON in the request body. The `signature`
   * field is part of the payload and must be verified against the rest of
   * the fields using the same SHA1 algorithm as for outgoing requests.
   */
  validateCallback(payload: Record<string, unknown>, _signature?: string): CallbackValidation {
    // Mock mode — accept anything
    if (this.isMockMode()) {
      return {
        orderId: String(payload.order_id || ''),
        transactionId: String(payload.payment_id || crypto.randomUUID()),
        status: payload.order_status === 'declined' ? 'FAILED' : 'COMPLETED',
        amount: Number(payload.amount || 0) / 100,
      };
    }

    const callbackSignature = payload.signature;
    if (typeof callbackSignature !== 'string' || !callbackSignature) {
      throw new Error('Missing Flitt callback signature');
    }

    const expected = this.buildSignature(payload);
    const sigBuffer = Buffer.from(callbackSignature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new Error('Invalid Flitt callback signature');
    }

    const status = payload.order_status === 'approved' ? 'COMPLETED' : 'FAILED';

    return {
      orderId: String(payload.order_id),
      transactionId: String(payload.payment_id),
      status,
      // Flitt amount is in the minor unit; convert back to whole units.
      amount: Number(payload.amount || 0) / 100,
    };
  }
}
