import { IsString, IsNotEmpty, IsInt, IsOptional, MaxLength, Min, Matches } from 'class-validator';

export class CreateBookmarkDto {
  @IsString()
  @IsNotEmpty({ message: 'bookId სავალდებულოა' })
  bookId: string;

  @IsInt({ message: 'chapterNumber უნდა იყოს მთელი რიცხვი' })
  @Min(1, { message: 'chapterNumber მინიმუმ 1 უნდა იყოს' })
  chapterNumber: number;

  @IsInt({ message: 'position უნდა იყოს მთელი რიცხვი' })
  @Min(0, { message: 'position არ შეიძლება იყოს უარყოფითი' })
  position: number;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'label მაქსიმუმ 200 სიმბოლო' })
  @Matches(/^[\p{L}\p{N}\s\-\u2014_.,:;!?()]+$/u, {
    message: 'label შეიცავს დაუშვებელ სიმბოლოებს',
  })
  label?: string;
}
