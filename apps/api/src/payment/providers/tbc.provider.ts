import { Injectable, Logger } from '@nestjs/common';
import { PaymentProviderInterface, PaymentResult, CallbackValidation } from './payment-provider.interface';
import * as crypto from 'crypto';

@Injectable()
export class TbcProvider implements PaymentProviderInterface {
  private readonly logger = new Logger(TbcProvider.name);
  private readonly apiKey: string | null;
  private readonly apiSecret: string | null;
  private readonly apiUrl: string;

  constructor() {
    this.apiKey = process.env.TBC_API_KEY || null;
    this.apiSecret = process.env.TBC_API_SECRET || null;
    this.apiUrl = process.env.TBC_API_URL || 'https://api.tbcbank.ge/v1/tpay';

    if (!this.apiKey || !this.apiSecret) {
      this.logger.warn('TBC credentials not set — using mock mode');
    }
  }

  async createOrder(
    amount: number,
    currency: string,
    description: string,
    callbackUrl: string,
  ): Promise<PaymentResult> {
    // Mock mode when no credentials
    if (!this.apiKey || !this.apiSecret) {
      const mockOrderId = `tbc_mock_${crypto.randomUUID()}`;
      this.logger.warn(`Mock TBC order created: ${mockOrderId} — ${amount} ${currency}`);
      return {
        orderId: mockOrderId,
        paymentUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/mock?orderId=${mockOrderId}&amount=${amount}&currency=${currency}`,
      };
    }

    // Real TBC Pay integration
    const response = await fetch(`${this.apiUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apiKey': this.apiKey,
      },
      body: JSON.stringify({
        amount: { currency, total: amount, subTotal: amount, tax: 0, shipping: 0 },
        returnurl: `${process.env.FRONTEND_URL}/payment/success`,
        extra: description,
        methods: [5], // card payment
        callbackUrl,
        preAuth: false,
        language: 'KA',
        merchantPaymentId: crypto.randomUUID(),
        installmentProducts: [],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`TBC order creation failed: ${errorText}`);
      throw new Error(`TBC payment failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      orderId: data.payId,
      paymentUrl: data.links?.[1]?.uri || data.uri,
    };
  }

  validateCallback(payload: Record<string, unknown>, signature?: string): CallbackValidation {
    // Mock mode — accept anything
    if (!this.apiSecret) {
      return {
        orderId: String(payload.PaymentId || payload.orderId || ''),
        transactionId: String(payload.TransactionId || payload.transactionId || crypto.randomUUID()),
        status: payload.Status === 'Failed' ? 'FAILED' : 'COMPLETED',
        amount: Number(payload.Amount || 0),
      };
    }

    // Real signature validation
    if (signature) {
      const expectedSignature = crypto
        .createHmac('sha256', this.apiSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

      if (signature !== expectedSignature) {
        throw new Error('Invalid TBC callback signature');
      }
    }

    return {
      orderId: String(payload.PaymentId),
      transactionId: String(payload.TransactionId),
      status: payload.Status === 'Succeeded' ? 'COMPLETED' : 'FAILED',
      amount: Number(payload.Amount),
    };
  }
}
