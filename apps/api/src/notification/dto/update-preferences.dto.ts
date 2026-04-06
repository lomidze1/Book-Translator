import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  translationCompleted?: boolean;

  @IsOptional()
  @IsBoolean()
  ttsCompleted?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentReceipt?: boolean;
}
