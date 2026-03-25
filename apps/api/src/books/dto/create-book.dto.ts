import { IsString, IsOptional, IsEnum, IsInt, IsNotEmpty, IsUrl, MaxLength, Min, Max } from 'class-validator';
import { FileFormat } from '@prisma/client';

export class CreateBookDto {
  @IsString()
  @IsNotEmpty({ message: 'სათაური სავალდებულოა' })
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  isbn?: string;

  @IsOptional()
  @IsUrl({}, { message: 'coverUrl უნდა იყოს ვალიდური URL' })
  coverUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  language?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50000)
  pageCount?: number;

  @IsEnum(FileFormat)
  originalFormat: FileFormat;

  @IsOptional()
  @IsString()
  googleBooksId?: string;

  @IsOptional()
  @IsString()
  openLibraryId?: string;
}
