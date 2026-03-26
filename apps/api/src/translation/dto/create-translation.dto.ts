import { IsString, IsOptional } from 'class-validator';

export class CreateTranslationDto {
  @IsString()
  bookId: string;

  @IsOptional()
  @IsString()
  targetLanguage?: string = 'ka';
}
