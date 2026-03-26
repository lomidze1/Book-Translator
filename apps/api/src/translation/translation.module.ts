import { Module } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { TranslationController } from './translation.controller';
import { TranslationProcessor } from './translation.processor';
import { ClaudeService } from './claude.service';
import { ParsingModule } from '../parsing/parsing.module';

@Module({
  imports: [ParsingModule],
  controllers: [TranslationController],
  providers: [TranslationService, TranslationProcessor, ClaudeService],
  exports: [TranslationService],
})
export class TranslationModule {}
