import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationProcessor } from './notification.processor';
import { NotificationGateway } from './notification.gateway';
import { PushService } from './push.service';

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationProcessor,
    NotificationGateway,
    PushService,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
