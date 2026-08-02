import { Module, forwardRef } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { TranslationController } from './translation.controller';
import { TranslationProcessor } from './translation.processor';
import { ClaudeService } from './claude.service';
import { ParsingModule } from '../parsing/parsing.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [ParsingModule, forwardRef(() => NotificationModule)],
  controllers: [TranslationController],
  providers: [TranslationService, TranslationProcessor, ClaudeService],
  exports: [TranslationService, ClaudeService],
})
export class TranslationModule {}
