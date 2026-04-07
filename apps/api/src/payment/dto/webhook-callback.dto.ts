import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * BOG webhook callback payload.
 * Validates required fields from BOG payment gateway.
 */
export class BogCallbackDto {
  @IsString()
  @IsNotEmpty()
  order_id: string;

  @IsString()
  @IsNotEmpty()
  status: string;

  [key: string]: unknown;
}

/**
 * TBC webhook callback payload.
 * Validates required fields from TBC payment gateway.
 */
export class TbcCallbackDto {
  @IsString()
  @IsNotEmpty()
  PaymentId: string;

  @IsString()
  @IsNotEmpty()
  Status: string;

  [key: string]: unknown;
}
