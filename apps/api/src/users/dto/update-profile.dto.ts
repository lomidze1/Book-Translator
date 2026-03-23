import { IsString, IsOptional, MaxLength, IsIn } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @IsIn(['ka', 'en'])
  locale?: string;

  @IsString()
  @IsOptional()
  avatar?: string;
}
