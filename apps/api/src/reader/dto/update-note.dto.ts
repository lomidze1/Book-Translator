import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'content სავალდებულოა' })
  @MaxLength(10000, { message: 'content მაქსიმუმ 10000 სიმბოლო' })
  content: string;
}
