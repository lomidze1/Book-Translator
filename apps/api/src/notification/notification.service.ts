import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationGateway } from './notification.gateway';
import { NOTIFICATION_QUEUE, getRedisConnection } from './notification.constants';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { SubscribePushDto } from './dto/subscribe-push.dto';

interface NotifyParams {
  userId: string;
  type: NotificationType;
  titleKa: string;
  titleEn: string;
  bodyKa: string;
  bodyEn: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private queue: Queue | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
  ) {
    try {
      this.queue = new Queue(NOTIFICATION_QUEUE, {
        connection: getRedisConnection(),
      });
    } catch (err) {
      this.logger.error(`Failed to create notification queue: ${err}`);
    }
  }

  async notify(params: NotifyParams): Promise<void> {
    const { userId, type, titleKa, titleEn, bodyKa, bodyEn, data } = params;

    try {
      // Get user with locale and preferences
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          locale: true,
          name: true,
          notificationPreference: true,
        },
      });

      if (!user) return;

      // Get or create preferences
      const prefs = user.notificationPreference || await this.getOrCreatePreferences(userId);

      // Check event-specific toggle
      const eventEnabled = this.isEventEnabled(prefs, type);
      if (!eventEnabled) {
        this.logger.log(`Notification skipped (event disabled): ${type} for user ${userId}`);
        return;
      }

      const title = user.locale === 'en' ? titleEn : titleKa;
      const body = user.locale === 'en' ? bodyEn : bodyKa;

      // 1. Create in-app notification
      if (prefs.inAppEnabled) {
        const createData: any = { userId, type, title, body };
        if (data) createData.data = data;
        const notification = await this.prisma.notification.create({
          data: createData,
        });

        // 2. Emit via WebSocket
        this.gateway.emitNotification(userId, notification);

        const unreadCount = await this.getUnreadCount(userId);
        this.gateway.emitUnreadCount(userId, unreadCount);
      }

      // 3. Enqueue async job for email + push
      if (this.queue && (prefs.emailEnabled || prefs.pushEnabled)) {
        await this.queue.add('send-notification', {
          userId,
          type,
          title,
          body,
          titleKa,
          titleEn,
          bodyKa,
          bodyEn,
          data,
          email: user.email,
          locale: user.locale,
          userName: user.name,
          emailEnabled: prefs.emailEnabled,
          pushEnabled: prefs.pushEnabled,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to send notification: ${error instanceof Error ? error.message : error}`);
    }
  }

  async getNotifications(userId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);

    return { notifications, total, page: safePage, limit: safeLimit };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  async markAsRead(userId: string, notificationId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
  }

  async getOrCreatePreferences(userId: string) {
    const existing = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (existing) return existing;

    return this.prisma.notificationPreference.create({
      data: { userId },
    });
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
  }

  async subscribePush(userId: string, dto: SubscribePushDto) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: dto.userAgent,
      },
      update: {
        userId,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: dto.userAgent,
      },
    });
  }

  async unsubscribePush(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
  }

  private isEventEnabled(
    prefs: { translationCompleted: boolean; ttsCompleted: boolean; paymentReceipt: boolean },
    type: NotificationType,
  ): boolean {
    switch (type) {
      case 'TRANSLATION_COMPLETED':
        return prefs.translationCompleted;
      case 'TTS_COMPLETED':
        return prefs.ttsCompleted;
      case 'PAYMENT_RECEIPT':
        return prefs.paymentReceipt;
      case 'SYSTEM':
        return true;
      default:
        return true;
    }
  }
}
