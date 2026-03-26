import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
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
    return this.translationService.createTranslation(dto.bookId, userId, dto.targetLanguage);
  }

  @Get('my')
  async getMyTranslations(@CurrentUser('id') userId: string) {
    return this.translationService.getMyTranslations(userId);
  }

  @Get(':id')
  async getTranslation(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.translationService.getTranslation(id, userId);
  }

  @Get('book/:bookId')
  async getByBook(@Param('bookId') bookId: string, @CurrentUser('id') userId: string) {
    return this.translationService.getTranslationsByBook(bookId, userId);
  }
}
