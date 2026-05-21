import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { TranslationService } from './translation.service';
import { CreateTranslationDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('translations')
@UseGuards(JwtAuthGuard)
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Post()
  async create(@Body() dto: CreateTranslationDto, @CurrentUser('id') userId: string) {
    return this.translationService.createTranslation(dto.bookId, userId, dto.targetLanguage, dto.translationType);
  }

  @Get('my')
  async getMyTranslations(
    @CurrentUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.translationService.getMyTranslations(userId, page, limit);
  }

  @Get(':id')
  async getTranslation(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.translationService.getTranslation(id, userId);
  }

  @Get('book/:bookId')
  async getByBook(
    @Param('bookId') bookId: string,
    @CurrentUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.translationService.getTranslationsByBook(bookId, userId, page, limit);
  }

  @Post(':id/retry')
  async retryTranslation(@Param('id') id: string, @CurrentUser('id') userId: string) {
    // Dev only — restart a stuck translation
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Not available in production');
    }

    // Verify ownership
    const translation = await this.translationService.getTranslation(id, userId);
    if (!translation) {
      throw new ForbiddenException('Translation not found or access denied');
    }

    // Reset status to PAID and re-queue
    await this.translationService.updateProgress(id, 0, 'PAID');
    return this.translationService.startTranslation(id);
  }
}
