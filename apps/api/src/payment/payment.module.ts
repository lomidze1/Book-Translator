import { Module, forwardRef } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { BogProvider } from './providers/bog.provider';
import { TbcProvider } from './providers/tbc.provider';
import { TranslationModule } from '../translation/translation.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [TranslationModule, forwardRef(() => NotificationModule)],
  controllers: [PaymentController],
  providers: [PaymentService, BogProvider, TbcProvider],
  exports: [PaymentService],
})
export class PaymentModule {}
