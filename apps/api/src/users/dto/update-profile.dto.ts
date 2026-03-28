import { IsString, IsOptional, MaxLength, MinLength, IsIn, IsUrl, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[\p{L}\s]+$/u, {
    message: 'name must contain only letters and spaces',
  })
  name?: string;

  @IsString()
  @IsOptional()
  @IsIn(['ka', 'en'])
  locale?: string;

  @IsUrl({}, { message: 'Avatar must be a valid URL' })
  @IsOptional()
  @MaxLength(2048)
  avatar?: string;
}
