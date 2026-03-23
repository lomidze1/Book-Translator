import { IsString, Matches } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @Matches(/^\+995\d{9}$/, { message: 'Phone must be a valid Georgian number (+995XXXXXXXXX)' })
  phone: string;
}
