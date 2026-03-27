export interface PaymentResult {
  orderId: string;
  paymentUrl: string;
}

export interface CallbackValidation {
  orderId: string;
  transactionId: string;
  status: 'COMPLETED' | 'FAILED';
  amount: number;
}

export interface PaymentProviderInterface {
  createOrder(amount: number, currency: string, description: string, callbackUrl: string): Promise<PaymentResult>;
  validateCallback(payload: Record<string, unknown>, signature?: string): CallbackValidation;
}
