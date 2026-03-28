import { IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @Length(64, 64, { message: 'Invalid verification token' })
  token: string;
}
