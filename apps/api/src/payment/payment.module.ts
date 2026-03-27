import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { BogProvider } from './providers/bog.provider';
import { TbcProvider } from './providers/tbc.provider';
import { TranslationModule } from '../translation/translation.module';

@Module({
  imports: [TranslationModule],
  controllers: [PaymentController],
  providers: [PaymentService, BogProvider, TbcProvider],
  exports: [PaymentService],
})
export class PaymentModule {}
