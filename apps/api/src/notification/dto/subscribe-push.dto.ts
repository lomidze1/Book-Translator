import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class SubscribePushDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  auth: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
