import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';
import { TtsProcessor } from './tts.processor';
import { TtsGateway } from './tts.gateway';
import { ElevenLabsProvider } from './providers/elevenlabs.provider';
import { AzureProvider } from './providers/azure.provider';
import { GoogleCloudProvider } from './providers/google-cloud.provider';
import { ProviderManager } from './providers/provider-manager';

@Module({
  imports: [AuthModule],
  controllers: [TtsController],
  providers: [
    TtsService,
    TtsProcessor,
    TtsGateway,
    ProviderManager,
    GoogleCloudProvider,
    ElevenLabsProvider,
    AzureProvider,
  ],
  exports: [TtsService, TtsGateway, ProviderManager],
})
export class TtsModule {}
