import { IsOptional, IsInt, Min, Max, IsString, IsIn } from 'class-validator';
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
