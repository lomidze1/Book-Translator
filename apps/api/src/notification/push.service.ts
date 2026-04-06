import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private webPush: any = null;

  constructor(private readonly prisma: PrismaService) {
    this.initWebPush();
  }

  private async initWebPush() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:support@booktranslator.ge';

    if (!publicKey || !privateKey) {
      this.logger.warn('⚠️  VAPID keys not set — push notifications disabled');
      return;
    }

    try {
      const webPush = await import('web-push');
      webPush.setVapidDetails(subject, publicKey, privateKey);
      this.webPush = webPush;
      this.logger.log('✅ Web Push initialized with VAPID keys');
    } catch (err) {
      this.logger.warn(`⚠️  web-push not available: ${err instanceof Error ? err.message : err}`);
    }
  }

  async sendToUser(userId: string, payload: { title: string; body: string; data?: Record<string, unknown> }): Promise<void> {
    if (!this.webPush) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) return;

    const payloadStr = JSON.stringify(payload);
    const expiredEndpoints: string[] = [];

    for (const sub of subscriptions) {
      try {
        await this.webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadStr,
        );
      } catch (error: any) {
        if (error?.statusCode === 410 || error?.statusCode === 404) {
          expiredEndpoints.push(sub.endpoint);
        } else {
          this.logger.error(`Push failed for ${sub.endpoint}: ${error?.message}`);
        }
      }
    }

    // Clean up expired subscriptions
    if (expiredEndpoints.length > 0) {
      await this.prisma.pushSubscription.deleteMany({
        where: { endpoint: { in: expiredEndpoints } },
      });
      this.logger.log(`Cleaned up ${expiredEndpoints.length} expired push subscriptions`);
    }
  }
}
