import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Flitt webhook callback payload.
 * Reference: https://docs.flitt.com/api/callbacks/
 *
 * Required fields are validated up-front; the full payload is preserved
 * (no whitelist stripping) so the HMAC signature can be verified by the
 * provider. See PaymentController for the per-route ValidationPipe config.
 */
export class FlittCallbackDto {
  @IsString()
  @IsNotEmpty()
  order_id: string;

  @IsString()
  @IsNotEmpty()
  order_status: string;

  @IsString()
  @IsNotEmpty()
  signature: string;

  [key: string]: unknown;
}
