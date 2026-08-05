import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  IsIn,
  IsNotEmpty,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AdminListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;
}

const TRANSLATION_STATUSES = ['PENDING', 'PAID', 'IN_PROGRESS', 'COMPLETED', 'FAILED'] as const;

export class AdminTranslationsQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(TRANSLATION_STATUSES)
  status?: (typeof TRANSLATION_STATUSES)[number];
}

const PAYMENT_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'] as const;

export class AdminPaymentsQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: (typeof PAYMENT_STATUSES)[number];
}

export class UpdateUserRoleDto {
  @IsIn(['USER', 'ADMIN'])
  role!: 'USER' | 'ADMIN';
}

const FEEDBACK_STATUSES = ['PENDING', 'RETRANSLATING', 'APPLIED', 'REJECTED'] as const;

export class AdminFeedbackQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(FEEDBACK_STATUSES)
  status?: (typeof FEEDBACK_STATUSES)[number];
}

const GLOSSARY_TYPES = ['character', 'place', 'organization', 'term'] as const;

export class GlossaryEntryDto {
  @IsString()
  @IsNotEmpty({ message: 'ტერმინი სავალდებულოა' })
  @MaxLength(100)
  term!: string;

  /** Blank removes the term from the glossary. */
  @IsString()
  @MaxLength(100)
  ka!: string;

  @IsOptional()
  @IsIn(GLOSSARY_TYPES)
  type?: (typeof GLOSSARY_TYPES)[number];

  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';
}

export class UpdateGlossaryDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GlossaryEntryDto)
  entries!: GlossaryEntryDto[];
}
