import { Module, forwardRef } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { FlittProvider } from './providers/flitt.provider';
import { TranslationModule } from '../translation/translation.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [TranslationModule, forwardRef(() => NotificationModule)],
  controllers: [PaymentController],
  providers: [PaymentService, FlittProvider],
  exports: [PaymentService],
})
export class PaymentModule {}
