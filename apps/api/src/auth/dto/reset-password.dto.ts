import { IsString, MinLength, MaxLength, Matches, Length } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @Length(64, 64, { message: 'Invalid reset token' })
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Z])(?=.*\d)/, {
    message: 'password must contain at least 1 uppercase letter and 1 number',
  })
  newPassword: string;
}
