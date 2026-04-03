import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';
import { TtsProcessor } from './tts.processor';
import { TtsGateway } from './tts.gateway';
import { ElevenLabsProvider } from './providers/elevenlabs.provider';
import { AzureProvider } from './providers/azure.provider';

@Module({
  imports: [AuthModule],
  controllers: [TtsController],
  providers: [
    TtsService,
    TtsProcessor,
    TtsGateway,
    ElevenLabsProvider,
    AzureProvider,
  ],
  exports: [TtsService, TtsGateway],
})
export class TtsModule {}
