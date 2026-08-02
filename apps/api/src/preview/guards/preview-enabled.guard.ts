import { Injectable, CanActivate, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Gates preview *generation* only — every generation spends Claude tokens.
 * Reading an already-generated preview stays available so flipping the flag off
 * doesn't break pages users are looking at (same rule as TtsEnabledGuard).
 * Flip ENABLE_PREVIEW=true to allow generation.
 */
@Injectable()
export class PreviewEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get('ENABLE_PREVIEW') !== 'true') {
      throw new ForbiddenException('Preview is temporarily unavailable');
    }
    return true;
  }
}
