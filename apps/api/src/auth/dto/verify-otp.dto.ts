import { IsString, Matches, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+995\d{9}$/, { message: 'Phone must be a valid Georgian number (+995XXXXXXXXX)' })
  phone: string;

  @IsString()
  @Length(6, 6)
  code: string;
}
