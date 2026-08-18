import { apiRequest } from './api';

export type PaymentProvider = 'FLITT';
export type PaymentType = 'TRANSLATION';

interface CreatePaymentParams {
  bookId: string;
  type: PaymentType;
  provider: PaymentProvider;
  translationId?: string;
}

interface CreatePaymentResponse {
  paymentUrl: string;
  paymentId: string;
}

interface BookPricing {
  newTranslation: number;
  existing: number;
  english: number;
}

export async function createPayment(params: CreatePaymentParams): Promise<CreatePaymentResponse> {
  return apiRequest<CreatePaymentResponse>('/payments', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getBookPricing(bookId: string): Promise<BookPricing> {
  return apiRequest<BookPricing>(`/payments/pricing/${bookId}`);
}
