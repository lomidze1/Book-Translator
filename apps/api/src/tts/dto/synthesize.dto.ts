import {
  IsString, IsNotEmpty, IsInt, IsOptional, IsNumber, IsUUID,
  Min, Max, IsIn, Matches, MaxLength, IsArray,
} from 'class-validator';

const VOICE_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;

export class SynthesizeDto {
  @IsUUID('4', { message: 'bookId არასწორი ფორმატია' })
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
  @IsIn(['google-cloud', 'elevenlabs', 'azure'], { message: 'provider უნდა იყოს: google-cloud, elevenlabs ან azure' })
  provider?: 'google-cloud' | 'elevenlabs' | 'azure';

  @IsOptional()
  @IsIn(['standard', 'premium'], { message: 'quality უნდა იყოს: standard ან premium' })
  quality?: 'standard' | 'premium';
}

export class SynthesizeBookDto {
  @IsUUID('4', { message: 'bookId არასწორი ფორმატია' })
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
  @IsIn(['google-cloud', 'elevenlabs', 'azure'], { message: 'provider უნდა იყოს: google-cloud, elevenlabs ან azure' })
  provider?: 'google-cloud' | 'elevenlabs' | 'azure';

  @IsOptional()
  @IsIn(['standard', 'premium'], { message: 'quality უნდა იყოს: standard ან premium' })
  quality?: 'standard' | 'premium';

  @IsOptional()
  @IsArray()
  @IsInt({ each: true, message: 'chapters უნდა იყოს მთელი რიცხვების მასივი' })
  chapters?: number[];
}

export class EstimateTtsDto {
  @IsUUID('4', { message: 'bookId არასწორი ფორმატია' })
  @IsNotEmpty({ message: 'bookId სავალდებულოა' })
  bookId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  voiceId?: string;

  @IsOptional()
  @IsIn(['google-cloud', 'elevenlabs', 'azure'])
  provider?: 'google-cloud' | 'elevenlabs' | 'azure';
}
