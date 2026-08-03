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
import { FeedbackService } from './feedback.service';
import { CreateTranslationDto } from './dto';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { devShortcutsEnabled } from '../common/dev-shortcuts';

@Controller('translations')
@UseGuards(JwtAuthGuard)
export class TranslationController {
  constructor(
    private readonly translationService: TranslationService,
    private readonly feedbackService: FeedbackService,
  ) {}

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

  /**
   * Reader-reported translation problem. Queues a targeted re-translation of
   * the affected passage and feeds our record of real errors.
   */
  @Post(':id/feedback')
  async createFeedback(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateFeedbackDto,
  ) {
    return this.feedbackService.create(id, userId, dto);
  }

  @Get(':id/feedback/quota')
  async getFeedbackQuota(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.feedbackService.getQuota(id, userId);
  }

  @Get(':id/feedback')
  async listFeedback(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.feedbackService.listForTranslation(id, userId);
  }

  @Post(':id/retry')
  async retryTranslation(@Param('id') id: string, @CurrentUser('id') userId: string) {
    // Dev only — restart a stuck translation. Fail-secure (see dev-shortcuts.ts).
    if (!devShortcutsEnabled()) {
      throw new ForbiddenException('Not available in this environment');
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
