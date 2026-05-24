import {
  IsString, IsNotEmpty, IsInt, IsOptional, IsNumber, IsUUID,
  Min, Max, IsIn, Matches, MaxLength, IsArray,
} from 'class-validator';

const VOICE_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;

export type TtsProvider = 'google-cloud' | 'elevenlabs' | 'azure';
export type TtsQuality = 'standard' | 'premium';

/**
 * Shared TTS request fields. The three concrete DTOs below extend this — when
 * we add a new field that applies to all of them (e.g. language override) it
 * lands here once instead of being copy-pasted three times.
 *
 * `bookId` is included because every TTS request is book-scoped; only
 * `chapterNumber` and the chapters[] array are call-site specific.
 */
export class BaseSynthesizeDto {
  @IsUUID('4', { message: 'bookId არასწორი ფორმატია' })
  @IsNotEmpty({ message: 'bookId სავალდებულოა' })
  bookId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'voiceId მაქსიმუმ 100 სიმბოლო' })
  @Matches(VOICE_ID_PATTERN, { message: 'voiceId შეიცავს დაუშვებელ სიმბოლოებს' })
  voiceId?: string;

  @IsOptional()
  @IsIn(['google-cloud', 'elevenlabs', 'azure'], {
    message: 'provider უნდა იყოს: google-cloud, elevenlabs ან azure',
  })
  provider?: TtsProvider;
}

/** Single-chapter synthesis. Adds chapterNumber + speed + quality. */
export class SynthesizeDto extends BaseSynthesizeDto {
  @IsInt({ message: 'chapterNumber უნდა იყოს მთელი რიცხვი' })
  @Min(1, { message: 'chapterNumber მინიმუმ 1 უნდა იყოს' })
  chapterNumber!: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5, { message: 'speed მინიმუმ 0.5 უნდა იყოს' })
  @Max(2.0, { message: 'speed მაქსიმუმ 2.0 უნდა იყოს' })
  speed?: number;

  @IsOptional()
  @IsIn(['standard', 'premium'], { message: 'quality უნდა იყოს: standard ან premium' })
  quality?: TtsQuality;
}

/** Whole-book synthesis. Adds speed + quality + optional chapter filter. */
export class SynthesizeBookDto extends BaseSynthesizeDto {
  @IsOptional()
  @IsNumber()
  @Min(0.5, { message: 'speed მინიმუმ 0.5 უნდა იყოს' })
  @Max(2.0, { message: 'speed მაქსიმუმ 2.0 უნდა იყოს' })
  speed?: number;

  @IsOptional()
  @IsIn(['standard', 'premium'], { message: 'quality უნდა იყოს: standard ან premium' })
  quality?: TtsQuality;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true, message: 'chapters უნდა იყოს მთელი რიცხვების მასივი' })
  chapters?: number[];
}

/** Cost / duration preview. Only needs the provider + voice signals. */
export class EstimateTtsDto extends BaseSynthesizeDto {}
