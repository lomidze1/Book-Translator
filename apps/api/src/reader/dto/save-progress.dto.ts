import { IsString, IsNotEmpty, IsInt, IsNumber, Min, Max } from 'class-validator';

export class SaveProgressDto {
  @IsString()
  @IsNotEmpty({ message: 'bookId სავალდებულოა' })
  bookId: string;

  @IsInt({ message: 'currentChapter უნდა იყოს მთელი რიცხვი' })
  @Min(1, { message: 'currentChapter მინიმუმ 1 უნდა იყოს' })
  currentChapter: number;

  @IsInt({ message: 'currentPosition უნდა იყოს მთელი რიცხვი' })
  @Min(0, { message: 'currentPosition არ შეიძლება იყოს უარყოფითი' })
  currentPosition: number;

  @IsNumber({}, { message: 'percentage უნდა იყოს რიცხვი' })
  @Min(0, { message: 'percentage მინიმუმ 0 უნდა იყოს' })
  @Max(100, { message: 'percentage მაქსიმუმ 100 უნდა იყოს' })
  percentage: number;
}
