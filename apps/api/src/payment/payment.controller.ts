import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { devShortcutsEnabled } from '../common/dev-shortcuts';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  async create(@Body() dto: CreatePaymentDto, @CurrentUser('id') userId: string) {
    return this.paymentService.createPayment(
      userId,
      dto.bookId,
      dto.type,
      dto.provider,
      dto.translationId,
      dto.translationType,
    );
  }

  // Public endpoint — get book pricing (fast/slow/existing)
  @Public()
  @Get('pricing/:bookId')
  async getBookPricing(@Param('bookId') bookId: string) {
    return this.paymentService.getBookPricing(bookId);
  }

  @Get('history')
  async getHistory(
    @CurrentUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.paymentService.getPaymentHistory(userId, page, limit);
  }

  @Get(':id')
  async getPayment(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.paymentService.getPaymentById(id, userId);
  }

  // Mock endpoint — simulate payment completion (dev only).
  // Fail-secure: requires NODE_ENV=development AND ENABLE_DEV_SHORTCUTS=true.
  @Post(':id/simulate')
  async simulate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    if (!devShortcutsEnabled()) {
      throw new ForbiddenException('Payment simulation is not available in this environment');
    }
    return this.paymentService.simulatePayment(id, userId);
  }

  // Flitt webhook callback — no auth (called by Flitt servers).
  // The SHA1 signature is computed over the full payload, so we must NOT
  // strip or reject extra fields. A per-route @UsePipes override does NOT
  // work here: global pipes run before route pipes, so the global
  // ValidationPipe (forbidNonWhitelisted) would 400 real Flitt payloads
  // before this handler is reached. Typing the body as a plain object makes
  // ValidationPipe skip it entirely; FlittProvider.validateCallback checks
  // the required fields and the signature itself.
  @Public()
  @Post('flitt/callback')
  async flittCallback(@Body() payload: Record<string, unknown>) {
    return this.paymentService.handleCallback('FLITT', payload);
  }
}
