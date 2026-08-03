import { Module, forwardRef } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { TranslationController } from './translation.controller';
import { TranslationProcessor } from './translation.processor';
import { ClaudeService } from './claude.service';
import { QualityCheckService } from './quality-check.service';
import { GeminiJudgeService } from './gemini-judge.service';
import { BatchEditorService } from './batch-editor.service';
import { EditorBatchProcessor } from './editor-batch.processor';
import { ParsingModule } from '../parsing/parsing.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [ParsingModule, forwardRef(() => NotificationModule)],
  controllers: [TranslationController],
  providers: [
    TranslationService,
    TranslationProcessor,
    ClaudeService,
    QualityCheckService,
    GeminiJudgeService,
    BatchEditorService,
    EditorBatchProcessor,
  ],
  exports: [TranslationService, ClaudeService, QualityCheckService, GeminiJudgeService],
})
export class TranslationModule {}
