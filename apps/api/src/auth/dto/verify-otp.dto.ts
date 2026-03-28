import { IsString, Matches, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+995\d{9}$/, { message: 'Phone must be a valid Georgian number (+995XXXXXXXXX)' })
  phone: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'OTP code must be 6 digits' })
  code: string;
}
