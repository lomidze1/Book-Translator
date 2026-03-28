import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BogProvider } from './providers/bog.provider';
import { TbcProvider } from './providers/tbc.provider';
import { PaymentProviderInterface, CallbackValidation } from './providers/payment-provider.interface';
import { TranslationService } from '../translation/translation.service';

const PRICING = {
  NEW_TRANSLATION: 10,
  EXISTING_TRANSLATION: 5,
  ENGLISH_ORIGINAL: 1,
} as const;

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly providers: Record<string, PaymentProviderInterface>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bogProvider: BogProvider,
    private readonly tbcProvider: TbcProvider,
    private readonly translationService: TranslationService,
  ) {
    this.providers = {
      BOG: this.bogProvider,
      TBC: this.tbcProvider,
    };
  }

  async createPayment(
    userId: string,
    bookId: string,
    type: 'TRANSLATION' | 'PURCHASE_ORIGINAL' | 'PURCHASE_TRANSLATION',
    providerName: 'BOG' | 'TBC',
    translationId?: string,
  ) {
    // Verify book exists
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      include: { userBooks: true },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    // For TRANSLATION type, user must own the book
    if (type === 'TRANSLATION') {
      const isOwner = book.userBooks.some((ub) => ub.userId === userId);
      if (!isOwner) {
        throw new ForbiddenException('You do not have access to this book');
      }
    }

    // Check for duplicate pending payments
    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        userId,
        status: { in: ['PENDING', 'PROCESSING'] },
        type,
        ...(translationId ? { translationId } : {}),
      },
    });

    if (existingPayment) {
      throw new BadRequestException('You already have a pending payment for this item');
    }

    // Determine amount and currency
    const { amount, currency } = this.getPrice(type);

    // Get provider
    const provider = this.providers[providerName];
    if (!provider) {
      throw new BadRequestException(`Payment provider ${providerName} is not supported`);
    }

    // Create payment record
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        translationId: translationId || null,
        amount,
        currency,
        status: 'PENDING',
        provider: providerName,
        type,
        description: `${type}: ${book.title.replace(/[\n\r]/g, ' ').slice(0, 200)}`,
      },
    });

    // Create order with provider
    const callbackUrl = `${process.env.API_URL || 'http://localhost:4000'}/api/payments/${providerName.toLowerCase()}/callback`;

    try {
      const result = await provider.createOrder(
        amount,
        currency,
        `Book Translator — ${book.title}`,
        callbackUrl,
      );

      // Update payment with provider order ID
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerOrderId: result.orderId,
          status: 'PROCESSING',
        },
      });

      return {
        paymentId: payment.id,
        paymentUrl: result.paymentUrl,
        orderId: result.orderId,
        amount,
        currency,
      };
    } catch (error) {
      // Mark payment as failed
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });

      this.logger.error(`Payment creation failed: ${error instanceof Error ? error.message : error}`);
      throw new BadRequestException('Payment creation failed. Please try again.');
    }
  }

  async handleCallback(
    providerName: 'BOG' | 'TBC',
    payload: Record<string, unknown>,
    signature?: string,
  ) {
    const provider = this.providers[providerName];
    if (!provider) {
      throw new BadRequestException(`Unknown provider: ${providerName}`);
    }

    let validation: CallbackValidation;
    try {
      validation = provider.validateCallback(payload, signature);
    } catch (error) {
      this.logger.error(`Callback validation failed: ${error instanceof Error ? error.message : error}`);
      throw new ForbiddenException('Invalid callback signature');
    }

    // Find payment by provider order ID
    const payment = await this.prisma.payment.findUnique({
      where: { providerOrderId: validation.orderId },
    });

    if (!payment) {
      this.logger.warn(`Payment not found for order: ${validation.orderId}`);
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === 'COMPLETED' || payment.status === 'FAILED') {
      this.logger.warn(`Payment ${payment.id} already in terminal state: ${payment.status}`);
      return { status: payment.status };
    }

    // Verify amount matches what we expect
    if (validation.amount > 0 && Number(payment.amount) !== validation.amount) {
      this.logger.error(
        `Amount mismatch for payment ${payment.id}: expected ${payment.amount}, got ${validation.amount}`,
      );
      throw new BadRequestException('Payment amount mismatch');
    }

    // Atomic update with status guard to prevent double-processing
    const updated = await this.prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      data: {
        status: validation.status,
        providerTxId: validation.transactionId,
        paidAt: validation.status === 'COMPLETED' ? new Date() : null,
      },
    });

    // If no rows updated, another request already processed this callback
    if (updated.count === 0) {
      this.logger.warn(`Payment ${payment.id} was already processed by concurrent request`);
      return { status: payment.status };
    }

    // If payment completed, trigger post-payment actions
    if (validation.status === 'COMPLETED') {
      await this.onPaymentCompleted({
        id: payment.id,
        userId: payment.userId,
        type: payment.type,
        translationId: payment.translationId,
      });
    }

    return { status: validation.status };
  }

  async getPaymentHistory(userId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          type: true,
          provider: true,
          description: true,
          paidAt: true,
          createdAt: true,
        },
      }),
      this.prisma.payment.count({ where: { userId } }),
    ]);

    return { payments, total, page: safePage, limit: safeLimit };
  }

  async getPaymentById(paymentId: string, userId: string) {
    return this.findPaymentForUser(paymentId, userId);
  }

  private async findPaymentForUser(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.userId !== userId) {
      throw new ForbiddenException('You do not have access to this payment');
    }

    return payment;
  }

  // Mock: simulate successful payment (development only)
  async simulatePayment(paymentId: string, userId: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Payment simulation is not available in production');
    }

    const payment = await this.findPaymentForUser(paymentId, userId);

    if (payment.status !== 'PENDING' && payment.status !== 'PROCESSING') {
      throw new BadRequestException(`Payment is already ${payment.status}`);
    }

    const updatedPayment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'COMPLETED',
        providerTxId: `sim_${Date.now()}`,
        paidAt: new Date(),
      },
    });

    await this.onPaymentCompleted(updatedPayment);

    return { status: 'COMPLETED', paymentId };
  }

  private async onPaymentCompleted(payment: {
    id: string;
    userId: string;
    type: string;
    translationId: string | null;
  }) {
    this.logger.log(`Payment completed: ${payment.id} (${payment.type})`);

    if (payment.type === 'TRANSLATION' && payment.translationId) {
      // Update translation status from PENDING to PAID
      await this.prisma.translation.update({
        where: { id: payment.translationId },
        data: { status: 'PAID' },
      });
      this.logger.log(`Translation ${payment.translationId} marked as PAID`);

      // Start translation processing
      await this.translationService.startTranslation(payment.translationId);
    }

    if (payment.type === 'PURCHASE_TRANSLATION' || payment.type === 'PURCHASE_ORIGINAL') {
      // Find the book related to this payment
      const bookRelation = payment.translationId
        ? await this.prisma.translation.findUnique({
            where: { id: payment.translationId },
            select: { bookId: true },
          })
        : null;

      if (bookRelation) {
        const userBookType = payment.type === 'PURCHASE_TRANSLATION'
          ? 'PURCHASED_TRANSLATION'
          : 'PURCHASED_ORIGINAL';

        await this.prisma.userBook.upsert({
          where: {
            userId_bookId_type: {
              userId: payment.userId,
              bookId: bookRelation.bookId,
              type: userBookType,
            },
          },
          create: {
            userId: payment.userId,
            bookId: bookRelation.bookId,
            type: userBookType,
          },
          update: {},
        });
        this.logger.log(`UserBook created: ${userBookType} for book ${bookRelation.bookId}`);
      }
    }
  }

  private getPrice(type: 'TRANSLATION' | 'PURCHASE_ORIGINAL' | 'PURCHASE_TRANSLATION') {
    switch (type) {
      case 'TRANSLATION':
        return { amount: PRICING.NEW_TRANSLATION, currency: 'GEL' };
      case 'PURCHASE_TRANSLATION':
        return { amount: PRICING.EXISTING_TRANSLATION, currency: 'GEL' };
      case 'PURCHASE_ORIGINAL':
        return { amount: PRICING.ENGLISH_ORIGINAL, currency: 'USD' };
    }
  }
}
