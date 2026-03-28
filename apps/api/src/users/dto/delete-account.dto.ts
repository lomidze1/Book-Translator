import { IsString, IsOptional, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  @IsString()
  @IsOptional()
  @MaxLength(128)
  password?: string;
}
