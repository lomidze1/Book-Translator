import { IsString, IsNotEmpty, IsInt, IsOptional, IsIn, Min, MaxLength } from 'class-validator';
import { HIGHLIGHT_COLORS } from './constants';

export class CreateHighlightDto {
  @IsString()
  @IsNotEmpty({ message: 'bookId სავალდებულოა' })
  bookId: string;

  @IsInt({ message: 'chapterNumber უნდა იყოს მთელი რიცხვი' })
  @Min(1, { message: 'chapterNumber მინიმუმ 1 უნდა იყოს' })
  chapterNumber: number;

  @IsInt({ message: 'startPosition უნდა იყოს მთელი რიცხვი' })
  @Min(0, { message: 'startPosition არ შეიძლება იყოს უარყოფითი' })
  startPosition: number;

  @IsInt({ message: 'endPosition უნდა იყოს მთელი რიცხვი' })
  @Min(1, { message: 'endPosition მინიმუმ 1 უნდა იყოს' })
  endPosition: number;

  @IsString()
  @IsNotEmpty({ message: 'selectedText სავალდებულოა' })
  @MaxLength(5000, { message: 'selectedText მაქსიმუმ 5000 სიმბოლო' })
  selectedText: string;

  @IsOptional()
  @IsIn(HIGHLIGHT_COLORS, { message: 'color უნდა იყოს: yellow, green, blue, red' })
  color?: string;
}
