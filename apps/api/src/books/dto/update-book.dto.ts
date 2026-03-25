import { IsString, IsOptional, IsInt, IsUrl, MaxLength, Min, Max } from 'class-validator';

export class UpdateBookDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUrl({}, { message: 'coverUrl უნდა იყოს ვალიდური URL' })
  coverUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50000)
  pageCount?: number;
}
