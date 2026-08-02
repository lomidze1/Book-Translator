import {
  Controller, Get, Post, Delete, Body, Param, Query,
  UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TtsService } from './tts.service';
import { SynthesizeDto, SynthesizeBookDto } from './dto/synthesize.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProviderManager } from './providers/provider-manager';
import { TtsEnabledGuard } from './guards/tts-enabled.guard';

@Controller('tts')
@UseGuards(JwtAuthGuard)
export class TtsController {
  constructor(
    private readonly ttsService: TtsService,
    private readonly providerManager: ProviderManager,
  ) {}

  // ========================
  // Existing endpoints (Phase 5)
  // ========================

  @Get('audio/:bookId/:chapterNumber')
  getAudio(
    @CurrentUser() user: { id: string },
    @Param('bookId') bookId: string,
    @Param('chapterNumber', ParseIntPipe) chapterNumber: number,
  ) {
    return this.ttsService.getAudioUrl(bookId, chapterNumber, user.id);
  }

  @Get('chapters/:bookId')
  listChapters(
    @CurrentUser() user: { id: string },
    @Param('bookId') bookId: string,
  ) {
    return this.ttsService.listAudioChapters(bookId, user.id);
  }

  @Post('synthesize')
  @UseGuards(TtsEnabledGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  synthesize(
    @CurrentUser() user: { id: string },
    @Body() dto: SynthesizeDto,
  ) {
    return this.ttsService.synthesize(user.id, dto);
  }

  // ========================
  // New endpoints (Phase 6)
  // ========================

  @Post('synthesize-book')
  @UseGuards(TtsEnabledGuard)
  @Throttle({ default: { ttl: 3600000, limit: 5 } })
  synthesizeBook(
    @CurrentUser() user: { id: string },
    @Body() dto: SynthesizeBookDto,
  ) {
    return this.ttsService.synthesizeBook(user.id, dto);
  }

  @Get('voices')
  getVoices() {
    return this.ttsService.getVoices();
  }

  @Get('status/:audioBookId')
  getStatus(
    @CurrentUser() user: { id: string },
    @Param('audioBookId') audioBookId: string,
  ) {
    return this.ttsService.getAudioBookStatus(audioBookId, user.id);
  }

  @Get('stream/:audioChapterId')
  getStream(
    @CurrentUser() user: { id: string },
    @Param('audioChapterId') audioChapterId: string,
  ) {
    return this.ttsService.getStreamUrl(audioChapterId, user.id);
  }

  @Delete('audio/:audioBookId')
  deleteAudio(
    @CurrentUser() user: { id: string },
    @Param('audioBookId') audioBookId: string,
  ) {
    return this.ttsService.deleteAudioBook(audioBookId, user.id);
  }

  // ========================
  // New Phase 6 endpoints
  // ========================

  @Get('estimate')
  estimate(
    @CurrentUser() user: { id: string },
    @Query('bookId') bookId: string,
    @Query('provider') provider?: string,
  ) {
    return this.ttsService.estimate(bookId, user.id, provider);
  }

  @Post('retry/:audioBookId')
  @UseGuards(TtsEnabledGuard)
  @Throttle({ default: { ttl: 3600000, limit: 10 } })
  retry(
    @CurrentUser() user: { id: string },
    @Param('audioBookId') audioBookId: string,
  ) {
    return this.ttsService.retryFailed(audioBookId, user.id);
  }

  @Get(':audioBookId/timestamps/:chapterNumber')
  getTimestamps(
    @CurrentUser() user: { id: string },
    @Param('audioBookId') audioBookId: string,
    @Param('chapterNumber', ParseIntPipe) chapterNumber: number,
  ) {
    return this.ttsService.getTimestamps(audioBookId, chapterNumber, user.id);
  }

  @Get('providers')
  getProviders() {
    return this.providerManager.getAvailableProviders();
  }

  @Get('voices/all')
  getAllVoices(@Query('language') language?: string) {
    return this.providerManager.getAllVoices(language);
  }
}
