import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { EmailService } from '../email/email.service';
import { PushService } from './push.service';
import { NOTIFICATION_QUEUE, getRedisConnection } from './notification.constants';

interface NotificationJobData {
  userId: string;
  type: string;
  title: string;
  body: string;
  titleKa: string;
  titleEn: string;
  bodyKa: string;
  bodyEn: string;
  data?: Record<string, unknown>;
  email?: string;
  locale: string;
  userName?: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
}

@Injectable()
export class NotificationProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly emailService: EmailService,
    private readonly pushService: PushService,
  ) {}

  onModuleInit(): void {
    try {
      const redisConn = getRedisConnection();
      this.logger.log(`Starting Notification Worker — Redis at ${redisConn.host}:${redisConn.port}`);

      this.worker = new Worker(
        NOTIFICATION_QUEUE,
        async (job: Job<NotificationJobData>) => {
          await this.processNotification(job);
        },
        {
          connection: redisConn,
          concurrency: 2,
          stalledInterval: 60000,
          lockDuration: 30000,
        },
      );

      this.worker.on('ready', () => this.logger.log('✅ Notification Worker is READY'));
      this.worker.on('failed', (job, err) => this.logger.error(`❌ Notification job ${job?.id} FAILED: ${err.message}`));
      this.worker.on('completed', (job) => this.logger.log(`✅ Notification job ${job.id} COMPLETED`));
      this.worker.on('error', (err) => this.logger.error(`❌ Notification Worker error: ${err.message}`));
    } catch (err) {
      this.logger.error(`❌ Notification worker init FAILED: ${err instanceof Error ? err.stack : err}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.logger.log('Notification Worker closed');
    }
  }

  private async processNotification(job: Job<NotificationJobData>): Promise<void> {
    const { userId, type, email, locale, userName, emailEnabled, pushEnabled, data } = job.data;

    // Send email notification
    if (emailEnabled && email) {
      try {
        await this.sendEmailByType(type, email, locale, userName, data);
      } catch (err) {
        this.logger.error(`Email notification failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Send push notification
    if (pushEnabled) {
      try {
        const title = locale === 'en' ? job.data.titleEn : job.data.titleKa;
        const body = locale === 'en' ? job.data.bodyEn : job.data.bodyKa;
        await this.pushService.sendToUser(userId, { title, body, data });
      } catch (err) {
        this.logger.error(`Push notification failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  private async sendEmailByType(
    type: string,
    email: string,
    locale: string,
    userName?: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    switch (type) {
      case 'TRANSLATION_COMPLETED':
        await this.emailService.sendTranslationCompletedEmail(email, locale, {
          bookTitle: (data?.bookTitle as string) || '',
          bookId: (data?.bookId as string) || '',
          userName,
        });
        break;
      case 'PAYMENT_RECEIPT':
        await this.emailService.sendPaymentReceiptEmail(email, locale, {
          amount: (data?.amount as number) || 0,
          currency: (data?.currency as string) || 'GEL',
          bookTitle: (data?.bookTitle as string) || '',
          paymentId: (data?.paymentId as string) || '',
          paidAt: data?.paidAt ? new Date(data.paidAt as string) : new Date(),
          userName,
        });
        break;
      case 'TTS_COMPLETED':
        await this.emailService.sendTtsCompletedEmail(email, locale, {
          bookTitle: (data?.bookTitle as string) || '',
          bookId: (data?.bookId as string) || '',
          audioBookId: (data?.audioBookId as string) || '',
          totalDuration: (data?.totalDuration as number) || 0,
          userName,
        });
        break;
      default:
        this.logger.warn(`No email template for notification type: ${type}`);
    }
  }
}
