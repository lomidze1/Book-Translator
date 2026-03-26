import { IsString, IsOptional, IsNotEmpty, IsIn } from 'class-validator';

export class CreateTranslationDto {
  @IsString()
  @IsNotEmpty()
  bookId: string;

  @IsOptional()
  @IsIn(['ka', 'en'])
  targetLanguage?: string = 'ka';
}
