import { IsString, IsNotEmpty, IsInt, IsOptional, MaxLength, Min } from 'class-validator';

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'bookId სავალდებულოა' })
  bookId: string;

  @IsInt({ message: 'chapterNumber უნდა იყოს მთელი რიცხვი' })
  @Min(1, { message: 'chapterNumber მინიმუმ 1 უნდა იყოს' })
  chapterNumber: number;

  @IsOptional()
  @IsString()
  highlightId?: string;

  @IsString()
  @IsNotEmpty({ message: 'content სავალდებულოა' })
  @MaxLength(10000, { message: 'content მაქსიმუმ 10000 სიმბოლო' })
  content: string;
}
