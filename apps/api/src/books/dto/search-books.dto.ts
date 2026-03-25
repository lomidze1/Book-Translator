import { IsString, IsOptional, IsInt, IsNotEmpty, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchBooksDto {
  @IsString()
  @IsNotEmpty({ message: 'საძიებო ტექსტი სავალდებულოა' })
  @MaxLength(200)
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(40)
  limit?: number = 10;
}
