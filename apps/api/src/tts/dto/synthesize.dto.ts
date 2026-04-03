import {
  IsString, IsNotEmpty, IsInt, IsOptional, IsNumber,
  Min, Max, IsIn, Matches, MaxLength,
} from 'class-validator';

const VOICE_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;

export class SynthesizeDto {
  @IsString()
  @IsNotEmpty({ message: 'bookId სავალდებულოა' })
  bookId: string;

  @IsInt({ message: 'chapterNumber უნდა იყოს მთელი რიცხვი' })
  @Min(1, { message: 'chapterNumber მინიმუმ 1 უნდა იყოს' })
  chapterNumber: number;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'voiceId მაქსიმუმ 100 სიმბოლო' })
  @Matches(VOICE_ID_PATTERN, { message: 'voiceId შეიცავს დაუშვებელ სიმბოლოებს' })
  voiceId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.5, { message: 'speed მინიმუმ 0.5 უნდა იყოს' })
  @Max(2.0, { message: 'speed მაქსიმუმ 2.0 უნდა იყოს' })
  speed?: number;

  @IsOptional()
  @IsIn(['elevenlabs', 'azure'], { message: 'provider უნდა იყოს: elevenlabs ან azure' })
  provider?: 'elevenlabs' | 'azure';
}

export class SynthesizeBookDto {
  @IsString()
  @IsNotEmpty({ message: 'bookId სავალდებულოა' })
  bookId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'voiceId მაქსიმუმ 100 სიმბოლო' })
  @Matches(VOICE_ID_PATTERN, { message: 'voiceId შეიცავს დაუშვებელ სიმბოლოებს' })
  voiceId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.5, { message: 'speed მინიმუმ 0.5 უნდა იყოს' })
  @Max(2.0, { message: 'speed მაქსიმუმ 2.0 უნდა იყოს' })
  speed?: number;

  @IsOptional()
  @IsIn(['elevenlabs', 'azure'], { message: 'provider უნდა იყოს: elevenlabs ან azure' })
  provider?: 'elevenlabs' | 'azure';
}
