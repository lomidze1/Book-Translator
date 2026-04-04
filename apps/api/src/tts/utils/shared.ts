/**
 * Shared TTS utilities — used by all providers
 */

/**
 * Escape XML special characters for SSML safety.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Estimate MP3 duration from buffer size.
 * Assumes constant bitrate encoding.
 *
 * @param bufferLength - Size of the audio buffer in bytes
 * @param bitrate - Bitrate in bits per second (default: 128000 for 128kbps)
 * @returns Duration in milliseconds
 */
export function estimateMp3Duration(bufferLength: number, bitrate = 128000): number {
  return Math.round((bufferLength * 8) / bitrate * 1000);
}

/**
 * Unified rate-limit error for all TTS providers.
 */
export class TtsRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number,
    public readonly provider: string,
  ) {
    super(message);
    this.name = 'TtsRateLimitError';
  }
}

/**
 * Cost per million characters by provider.
 */
export const COST_PER_MILLION_CHARS: Record<string, number> = {
  'google-cloud': 4,
  elevenlabs: 5,
  azure: 4,
};

/**
 * Approximate characters per second of audio output.
 */
export const CHARS_PER_AUDIO_SECOND = 150;
