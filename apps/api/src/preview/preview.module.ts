import { Module } from '@nestjs/common';
import { PreviewService } from './preview.service';
import { PreviewController } from './preview.controller';
import { PreviewProcessor } from './preview.processor';
import { TranslationModule } from '../translation/translation.module';

@Module({
  // TranslationModule supplies ClaudeService and TranslationService
  // (parseAndSaveChapters). It does not import PreviewModule, so no forwardRef.
  imports: [TranslationModule],
  controllers: [PreviewController],
  providers: [PreviewService, PreviewProcessor],
  exports: [PreviewService],
})
export class PreviewModule {}
