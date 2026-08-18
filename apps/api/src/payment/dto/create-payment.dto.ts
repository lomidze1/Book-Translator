import { IsString, IsNotEmpty, IsIn, IsOptional } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  bookId: string;

  // PURCHASE_ORIGINAL / PURCHASE_TRANSLATION are resale types, removed from the
  // accepted set while ENABLE_BOOK_RESALE is off — the service keeps the flag-gated
  // handlers, but the API boundary rejects them outright.
  @IsIn(['TRANSLATION'])
  type: 'TRANSLATION';

  @IsIn(['FLITT'])
  provider: 'FLITT';

  @IsOptional()
  @IsString()
  translationId?: string;

  // Required when type === 'TRANSLATION' (server enforces this). Determines price tier.
  @IsOptional()
  @IsIn(['FAST', 'STANDARD'])
  translationType?: 'FAST' | 'STANDARD';
}
