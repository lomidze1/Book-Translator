import { IsString, Length } from 'class-validator';

export class ConfirmPasswordChangeDto {
  @IsString()
  @Length(64, 64)
  token: string;
}
