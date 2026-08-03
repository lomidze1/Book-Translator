import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateFeedbackDto {
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
  @IsNotEmpty({ message: 'მონიშნული ტექსტი სავალდებულოა' })
  @MaxLength(5000, { message: 'მონიშნული ტექსტი მაქსიმუმ 5000 სიმბოლო' })
  selectedText: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'კომენტარი მაქსიმუმ 1000 სიმბოლო' })
  comment?: string;
}
