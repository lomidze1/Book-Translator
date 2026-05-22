import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FlittProvider } from './providers/flitt.provider';
import { PaymentProviderInterface, CallbackValidation } from './providers/payment-provider.interface';
import { TranslationService } from '../translation/translation.service';
import { NotificationService } from '../notification/notification.service';
import { devShortcutsEnabled } from '../common/dev-shortcuts';

export type PaymentProviderName = 'FLITT';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly providers: Record<PaymentProviderName, PaymentProviderInterface>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly flittProvider: FlittProvider,
    private readonly translationService: TranslationService,
    private readonly notificationService: NotificationService,
  ) {
    this.providers = {
      FLITT: this.flittProvider,
    };
  }

  /**
   * Calculate dynamic price based on page count and translation type
   */
  calculatePrice(pageCount: number, translationType: 'FAST' | 'STANDARD' = 'FAST') {
    const perPageFast = parseFloat(this.config.get('PRICE_PER_PAGE_FAST') || '0.15');
    const perPageSlow = parseFloat(this.config.get('PRICE_PER_PAGE_SLOW') || '0.07');
    const minPrice = parseFloat(this.config.get('PRICE_MIN') || '10');
    const currency = this.config.get('PRICE_CURRENCY') || 'GEL';

    const rate = translationType === 'FAST' ? perPageFast : perPageSlow;
    const calculated = Math.round(pageCount * rate);
    const amount = Math.max(calculated, minPrice);

    return { amount, currency, pageCount, rate, translationType };
  }

  /**
   * Get price for already-translated book (fixed price)
   */
  getExistingTranslationPrice() {
    const amount = parseFloat(this.config.get('PRICE_EXISTING') || '5');
    const currency = this.config.get('PRICE_CURRENCY') || 'GEL';
    return { amount, currency };
  }

  /**
   * Get both pricing options for a book
   */
  async getBookPricing(bookId: string) {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        pageCount: true,
        title: true,
        chapters: {
          select: { wordCount: true },
        },
        translations: {
          where: { status: 'COMPLETED' },
          select: { id: true },
        },
      },
    });

    if (!book) throw new NotFoundException('Book not found');

    // Calculate pageCount: from DB field, or from chapters wordCount
    let pageCount = book.pageCount || 0;
    if (pageCount === 0 && book.chapters.length > 0) {
      const totalWords = book.chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
      pageCount = Math.ceil(totalWords / 250);
    }
    const hasCompletedTranslation = book.translations.length > 0;

    if (hasCompletedTranslation) {
      const existing = this.getExistingTranslationPrice();
      return {
        bookId: book.id,
        pageCount,
        hasExistingTranslation: true,
        existing: { amount: existing.amount, currency: existing.currency },
        fast: null,
        slow: null,
      };
    }

    const fast = this.calculatePrice(pageCount, 'FAST');
    const slow = this.calculatePrice(pageCount, 'STANDARD');

    return {
      bookId: book.id,
      pageCount,
      hasExistingTranslation: false,
      existing: null,
      fast: { amount: fast.amount, currency: fast.currency },
      slow: { amount: slow.amount, currency: slow.currency },
    };
  }

  async createPayment(
    userId: string,
    bookId: string,
    type: 'TRANSLATION' | 'PURCHASE_ORIGINAL' | 'PURCHASE_TRANSLATION',
    providerName: PaymentProviderName,
    translationId?: string,
    translationType?: 'FAST' | 'STANDARD',
  ) {
    // For TRANSLATION we need translationType up-front so we don't even fetch the book
    // when the request is malformed.
    if (type === 'TRANSLATION' && !translationType) {
      throw new BadRequestException(
        'translationType (FAST | STANDARD) is required for TRANSLATION payments',
      );
    }

    // Verify book exists. Pull chapters so we can derive page count for books that
    // were uploaded without a pageCount (same logic as getBookPricing).
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      include: {
        userBooks: true,
        chapters: { select: { wordCount: true } },
      },
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

    // Derive page count: prefer book.pageCount, else words / 250.
    let effectivePageCount = book.pageCount || 0;
    if (effectivePageCount === 0 && book.chapters.length > 0) {
      const totalWords = book.chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
      effectivePageCount = Math.ceil(totalWords / 250);
    }

    // Determine amount and currency (dynamic based on page count)
    const { amount, currency } = this.getPrice(type, effectivePageCount, translationType);

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
    const apiUrl = this.config.get<string>('API_URL') || 'http://localhost:4000';
    const callbackUrl = `${apiUrl}/api/payments/${providerName.toLowerCase()}/callback`;

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
    providerName: PaymentProviderName,
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

    // Verify amount matches what we expect — always (rejects zero-amount bypass).
    if (Number(payment.amount) !== validation.amount) {
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

  // Mock: simulate successful payment (development only).
  // Fail-secure: requires both NODE_ENV=development AND ENABLE_DEV_SHORTCUTS=true.
  async simulatePayment(paymentId: string, userId: string) {
    if (!devShortcutsEnabled()) {
      throw new ForbiddenException('Payment simulation is not available in this environment');
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

    // Send payment receipt notification
    try {
      const fullPayment = await this.prisma.payment.findUnique({
        where: { id: payment.id },
        include: { translation: { include: { book: true } } },
      });
      if (fullPayment) {
        const bookTitle = fullPayment.translation?.book?.title || fullPayment.description || '';
        await this.notificationService.notify({
          userId: payment.userId,
          type: 'PAYMENT_RECEIPT',
          titleKa: 'გადახდა წარმატებულია',
          titleEn: 'Payment Successful',
          bodyKa: `${fullPayment.amount} ${fullPayment.currency} — ${bookTitle}`,
          bodyEn: `${fullPayment.amount} ${fullPayment.currency} — ${bookTitle}`,
          data: {
            paymentId: payment.id,
            amount: Number(fullPayment.amount),
            currency: fullPayment.currency,
            bookTitle,
            paidAt: fullPayment.paidAt?.toISOString(),
          },
        });
      }
    } catch (err) {
      this.logger.error(`Payment notification failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private getPrice(
    type: 'TRANSLATION' | 'PURCHASE_ORIGINAL' | 'PURCHASE_TRANSLATION',
    pageCount?: number,
    translationType?: 'FAST' | 'STANDARD',
  ) {
    switch (type) {
      case 'TRANSLATION':
        // translationType is required for TRANSLATION — refuse to fall back to minimum.
        // Falling back silently caused every translation to bill PRICE_MIN regardless of size.
        if (!translationType) {
          throw new BadRequestException(
            'translationType is required for TRANSLATION payments',
          );
        }
        if (!pageCount || pageCount <= 0) {
          throw new BadRequestException(
            'Cannot price a TRANSLATION for a book with unknown page count',
          );
        }
        return this.calculatePrice(pageCount, translationType);
      case 'PURCHASE_TRANSLATION':
        return this.getExistingTranslationPrice();
      case 'PURCHASE_ORIGINAL':
        return { amount: 1, currency: 'USD' };
    }
  }
}
