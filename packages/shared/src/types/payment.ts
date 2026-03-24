export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
export type PaymentProvider = 'BOG' | 'TBC';
export type PaymentType = 'TRANSLATION' | 'PURCHASE_ORIGINAL' | 'PURCHASE_TRANSLATION';

export interface Payment {
  id: string;
  userId: string;
  translationId: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: PaymentProvider | null;
  type: PaymentType;
  providerTransactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
