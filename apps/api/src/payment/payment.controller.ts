import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Headers,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

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
    return this.paymentService.simulatePayment(id, userId);
  }

  // Webhook callbacks — no auth (called by payment providers)
  @Public()
  @Post('bog/callback')
  async bogCallback(
    @Body() payload: Record<string, unknown>,
    @Headers('x-bog-signature') signature?: string,
  ) {
    return this.paymentService.handleCallback('BOG', payload, signature);
  }

  @Public()
  @Post('tbc/callback')
  async tbcCallback(
    @Body() payload: Record<string, unknown>,
    @Headers('x-tbc-signature') signature?: string,
  ) {
    return this.paymentService.handleCallback('TBC', payload, signature);
  }
}
