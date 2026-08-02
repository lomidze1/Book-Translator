import { Injectable, CanActivate, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Audio (TTS) generation is paused for launch. Reading already-generated audio
 * stays available so existing audiobooks keep playing.
 * Flip ENABLE_TTS=true to re-enable generation.
 */
@Injectable()
export class TtsEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get('ENABLE_TTS') !== 'true') {
      throw new ForbiddenException('Audio generation is temporarily unavailable');
    }
    return true;
  }
}
