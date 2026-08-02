import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PreviewService } from './preview.service';
import { CreatePreviewDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PreviewEnabledGuard } from './guards/preview-enabled.guard';

@Controller('previews')
@UseGuards(JwtAuthGuard)
export class PreviewController {
  constructor(private readonly previewService: PreviewService) {}

  @Post()
  @UseGuards(PreviewEnabledGuard)
  @Throttle({ preview: { ttl: 3600000, limit: 5 } })
  create(@CurrentUser('id') userId: string, @Body() dto: CreatePreviewDto) {
    return this.previewService.createPreview(dto.bookId, userId, dto.targetLanguage);
  }

  // No PreviewEnabledGuard: an already-generated preview stays readable after
  // the flag is switched off.
  @Get('book/:bookId')
  getByBook(
    @CurrentUser('id') userId: string,
    @Param('bookId') bookId: string,
    @Query('targetLanguage') targetLanguage?: string,
  ) {
    return this.previewService.getPreviewByBook(bookId, userId, targetLanguage || 'ka');
  }
}
