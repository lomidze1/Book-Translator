import { Injectable, Logger } from '@nestjs/common';
import { TtsProvider, TtsOptions, TtsSynthesisResult, Voice } from './tts-provider.interface';
import { estimateMp3Duration, TtsRateLimitError } from '../utils/shared';
import { fetchWithTimeout } from '../../common/fetch';

@Injectable()
export class ElevenLabsProvider implements TtsProvider {
  private readonly logger = new Logger(ElevenLabsProvider.name);
  private readonly baseUrl = 'https://api.elevenlabs.io/v1';
  private readonly apiKey: string;
  private readonly defaultVoiceId: string;
  private readonly modelId: string;

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY || '';
    this.defaultVoiceId = process.env.ELEVENLABS_DEFAULT_VOICE_ID || '';
    this.modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_v3';
  }

  getName(): string {
    return 'elevenlabs';
  }

  getMaxChunkSize(): number {
    return parseInt(process.env.TTS_CHUNK_MAX_BYTES || '4500');
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/voices`,
        { method: 'GET', headers: { 'xi-api-key': this.apiKey } },
        5_000,
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  async synthesize(text: string, options: TtsOptions): Promise<TtsSynthesisResult> {
    const voiceId = options.voiceId || this.defaultVoiceId;
    if (!voiceId) throw new Error('ElevenLabs: voiceId is required');
    if (!this.apiKey) throw new Error('ElevenLabs: API key not configured');

    const res = await fetchWithTimeout(
      `${this.baseUrl}/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            speed: options.speed || 1.0,
          },
        }),
      },
      30_000,
    );

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      throw new TtsRateLimitError(
        `ElevenLabs rate limit exceeded`,
        retryAfter ? parseInt(retryAfter) : 60,
        'elevenlabs',
      );
    }

    if (res.status === 401) {
      throw new Error('ElevenLabs: Invalid API key');
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ElevenLabs API error ${res.status}: ${body}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('audio')) {
      throw new Error(`ElevenLabs: unexpected content-type: ${contentType}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    const durationMs = estimateMp3Duration(audioBuffer.length);

    return { audioBuffer, durationMs };
  }

  async getVoices(language?: string): Promise<Voice[]> {
    if (!this.apiKey) return [];

    const res = await fetchWithTimeout(
      `${this.baseUrl}/voices`,
      { headers: { 'xi-api-key': this.apiKey } },
      10_000,
    );

    if (!res.ok) return [];

    const data: any = await res.json();
    const voices: Voice[] = (data.voices || []).map((v: any) => ({
      id: v.voice_id,
      name: v.name,
      language: v.labels?.language || 'unknown',
      gender: v.labels?.gender || 'neutral',
      provider: 'elevenlabs',
      previewUrl: v.preview_url,
    }));

    if (language) {
      return voices.filter((v) =>
        v.language.toLowerCase().includes(language.toLowerCase()),
      );
    }

    return voices;
  }
}

// Re-export for backwards compatibility
export { TtsRateLimitError } from '../utils/shared';
