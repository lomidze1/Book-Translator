import { IsString, IsOptional, IsNotEmpty, IsIn } from 'class-validator';

export class CreatePreviewDto {
  @IsString()
  @IsNotEmpty()
  bookId: string;

  // Georgian only for now — the translator prompt is English→Georgian.
  @IsOptional()
  @IsIn(['ka'])
  targetLanguage?: string = 'ka';
}
