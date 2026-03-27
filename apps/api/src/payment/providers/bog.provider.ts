import { Injectable, Logger } from '@nestjs/common';
import { PaymentProviderInterface, PaymentResult, CallbackValidation } from './payment-provider.interface';
import * as crypto from 'crypto';

@Injectable()
export class BogProvider implements PaymentProviderInterface {
  private readonly logger = new Logger(BogProvider.name);
  private readonly clientId: string | null;
  private readonly clientSecret: string | null;
  private readonly apiUrl: string;

  constructor() {
    this.clientId = process.env.BOG_CLIENT_ID || null;
    this.clientSecret = process.env.BOG_CLIENT_SECRET || null;
    this.apiUrl = process.env.BOG_API_URL || 'https://ipay.ge/opay/api/v1';

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn('BOG credentials not set — using mock mode');
    }
  }

  async createOrder(
    amount: number,
    currency: string,
    description: string,
    callbackUrl: string,
  ): Promise<PaymentResult> {
    // Mock mode when no credentials
    if (!this.clientId || !this.clientSecret) {
      const mockOrderId = `bog_mock_${crypto.randomUUID()}`;
      this.logger.warn(`Mock BOG order created: ${mockOrderId} — ${amount} ${currency}`);
      return {
        orderId: mockOrderId,
        paymentUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/mock?orderId=${mockOrderId}&amount=${amount}&currency=${currency}`,
      };
    }

    // Real BOG iPay integration
    const response = await fetch(`${this.apiUrl}/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        items: [{
          amount: amount.toFixed(2),
          description,
          quantity: '1',
          product_id: 'book_translation',
        }],
        locale: 'ka',
        shop_order_id: crypto.randomUUID(),
        redirect_url: `${process.env.FRONTEND_URL}/payment/success`,
        reject_url: `${process.env.FRONTEND_URL}/payment/failure`,
        callback_url: callbackUrl,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`BOG order creation failed: ${errorText}`);
      throw new Error(`BOG payment failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      orderId: data.order_id,
      paymentUrl: data.links?.redirect || data.redirect_url,
    };
  }

  validateCallback(payload: Record<string, unknown>, signature?: string): CallbackValidation {
    // Mock mode — accept anything
    if (!this.clientSecret) {
      return {
        orderId: String(payload.order_id || payload.orderId || ''),
        transactionId: String(payload.payment_id || payload.transactionId || crypto.randomUUID()),
        status: payload.status === 'FAILED' ? 'FAILED' : 'COMPLETED',
        amount: Number(payload.amount || 0),
      };
    }

    // Real signature validation
    if (signature) {
      const expectedSignature = crypto
        .createHmac('sha256', this.clientSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

      if (signature !== expectedSignature) {
        throw new Error('Invalid BOG callback signature');
      }
    }

    return {
      orderId: String(payload.order_id),
      transactionId: String(payload.payment_id),
      status: payload.status === 'success' ? 'COMPLETED' : 'FAILED',
      amount: Number(payload.amount),
    };
  }
}
