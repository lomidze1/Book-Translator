import { IsString, IsNotEmpty, IsIn, IsOptional } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  bookId: string;

  @IsIn(['TRANSLATION', 'PURCHASE_ORIGINAL', 'PURCHASE_TRANSLATION'])
  type: 'TRANSLATION' | 'PURCHASE_ORIGINAL' | 'PURCHASE_TRANSLATION';

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
