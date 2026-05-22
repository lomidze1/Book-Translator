import { IsString, IsNotEmpty, MaxLength, IsUrl } from 'class-validator';

export class UnsubscribePushDto {
  // Push endpoints are URLs issued by the browser's push service (FCM, Mozilla, etc.).
  // We cap length defensively — real endpoints are <500 chars; 2048 leaves plenty of
  // margin without letting callers ship arbitrary payloads to Prisma.
  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  endpoint!: string;
}
