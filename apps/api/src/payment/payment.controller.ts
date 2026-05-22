import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
  ParseIntPipe,
  DefaultValuePipe,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentService } from './payment.service';
import { CreatePaymentDto, FlittCallbackDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

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

  // Mock endpoint — simulate payment completion (dev only)
  @Post(':id/simulate')
  async simulate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('Payment simulation is not available in production');
    }
    return this.paymentService.simulatePayment(id, userId);
  }

  // Flitt webhook callback — no auth (called by Flitt servers).
  // The SHA1 signature is computed over the full payload, so we must NOT
  // strip extra fields. Override the global ValidationPipe to keep them.
  @Public()
  @UsePipes(new ValidationPipe({ whitelist: false, forbidNonWhitelisted: false, transform: true }))
  @Post('flitt/callback')
  async flittCallback(@Body() payload: FlittCallbackDto) {
    return this.paymentService.handleCallback('FLITT', payload);
  }
}
