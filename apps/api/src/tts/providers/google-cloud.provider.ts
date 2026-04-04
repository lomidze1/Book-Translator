import { Injectable, Logger } from '@nestjs/common';
import { TtsProvider, TtsOptions, TtsSynthesisResult, Voice } from './tts-provider.interface';
import { escapeXml, estimateMp3Duration, TtsRateLimitError } from '../utils/shared';

interface GoogleTtsClient {
  synthesizeSpeech(request: unknown): Promise<[{ audioContent: Uint8Array | string | null }]>;
  listVoices(request: unknown): Promise<[{ voices: GoogleVoice[] }]>;
  close(): Promise<void>;
}

interface GoogleVoice {
  name: string;
  ssmlGender: 'MALE' | 'FEMALE' | 'NEUTRAL' | 'SSML_VOICE_GENDER_UNSPECIFIED';
  languageCodes: string[];
  naturalSampleRateHertz: number;
}

@Injectable()
export class GoogleCloudProvider implements TtsProvider {
  private readonly logger = new Logger(GoogleCloudProvider.name);
  private clientPromise: Promise<GoogleTtsClient | null> | null = null;
  private readonly projectId: string;
  private readonly credentialsPath: string;

  constructor() {
    this.projectId = process.env.GOOGLE_CLOUD_TTS_PROJECT_ID || '';
    this.credentialsPath = process.env.GOOGLE_CLOUD_TTS_CREDENTIALS_PATH || '';
  }

  getName(): string {
    return 'google-cloud';
  }

  getMaxChunkSize(): number {
    return parseInt(process.env.TTS_CHUNK_MAX_BYTES_GOOGLE || '5000');
  }

  async isAvailable(): Promise<boolean> {
    try {
      const client = await this.getClient();
      if (!client) return false;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        await client.listVoices({ languageCode: 'ka-GE' });
        clearTimeout(timeout);
        return true;
      } catch {
        clearTimeout(timeout);
        return false;
      }
    } catch {
      return false;
    }
  }

  async synthesize(text: string, options: TtsOptions): Promise<TtsSynthesisResult> {
    const client = await this.getClient();
    if (!client) {
      throw new Error('Google Cloud TTS: credentials not configured');
    }

    const voiceId = options.voiceId;
    if (!voiceId) {
      throw new Error('Google Cloud TTS: voiceId is required');
    }

    const languageCode = this.extractLanguageCode(voiceId);
    const ssml = this.buildSsml(text, options.speed);

    try {
      const [response] = await client.synthesizeSpeech({
        input: { ssml },
        voice: {
          name: voiceId,
          languageCode,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          sampleRateHertz: options.sampleRate || 24000,
          speakingRate: options.speed || 1.0,
        },
      });

      if (!response.audioContent) {
        throw new Error('Google Cloud TTS: empty audio response');
      }

      const audioBuffer = Buffer.isBuffer(response.audioContent)
        ? response.audioContent
        : Buffer.from(response.audioContent as Uint8Array);

      const durationMs = estimateMp3Duration(audioBuffer.length);

      return { audioBuffer, durationMs };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('UNAUTHENTICATED') || error.message.includes('401')) {
          throw new Error('Google Cloud TTS: invalid credentials');
        }
        if (error.message.includes('RESOURCE_EXHAUSTED') || error.message.includes('429')) {
          throw new TtsRateLimitError('Google Cloud TTS rate limit exceeded', 60, 'google-cloud');
        }
        if (error.message.includes('DEADLINE_EXCEEDED')) {
          throw new Error('Google Cloud TTS: request timeout');
        }
      }
      throw error;
    }
  }

  async getVoices(language?: string): Promise<Voice[]> {
    const client = await this.getClient();
    if (!client) return [];

    try {
      const [response] = await client.listVoices({
        languageCode: language || '',
      });

      return (response.voices || []).map((v) => ({
        id: v.name,
        name: this.formatVoiceName(v.name, v.ssmlGender),
        language: v.languageCodes?.[0] || 'unknown',
        gender: this.mapGender(v.ssmlGender),
        provider: 'google-cloud',
      }));
    } catch {
      return [];
    }
  }

  buildSsml(text: string, speed?: number): string {
    const escapedText = escapeXml(text);

    if (speed && speed !== 1.0) {
      const rate = `${Math.round(speed * 100)}%`;
      return `<speak><prosody rate="${rate}">${escapedText}</prosody></speak>`;
    }

    return `<speak>${escapedText}</speak>`;
  }

  private getClient(): Promise<GoogleTtsClient | null> {
    if (!this.credentialsPath && !this.projectId && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return Promise.resolve(null);
    }

    if (!this.clientPromise) {
      this.clientPromise = this.initClient();
    }
    return this.clientPromise;
  }

  private async initClient(): Promise<GoogleTtsClient | null> {
    try {
      const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');

      const opts: Record<string, string> = {};
      if (this.credentialsPath) {
        opts.keyFilename = this.credentialsPath;
      }
      if (this.projectId) {
        opts.projectId = this.projectId;
      }

      const client = new TextToSpeechClient(opts) as unknown as GoogleTtsClient;
      this.logger.log('Google Cloud TTS client initialized');
      return client;
    } catch (err) {
      this.logger.error(`Failed to initialize Google Cloud TTS client: ${err instanceof Error ? err.message : err}`);
      this.clientPromise = null; // Allow retry on next call
      return null;
    }
  }

  private extractLanguageCode(voiceId: string): string {
    // Voice IDs are like "ka-GE-Neural2-A" → language code is "ka-GE"
    const parts = voiceId.split('-');
    if (parts.length >= 2) {
      return `${parts[0]}-${parts[1]}`;
    }
    return 'ka-GE';
  }

  private formatVoiceName(voiceId: string, gender: string): string {
    // "ka-GE-Neural2-A" → "Georgian Neural2 A (Female)"
    const parts = voiceId.split('-');
    const langMap: Record<string, string> = {
      ka: 'Georgian',
      en: 'English',
      ru: 'Russian',
      de: 'German',
      fr: 'French',
    };
    const lang = langMap[parts[0]] || parts[0];
    const model = parts.length >= 3 ? parts.slice(2).join(' ') : '';
    const genderLabel = gender === 'FEMALE' ? 'Female' : gender === 'MALE' ? 'Male' : '';

    return `${lang} ${model}${genderLabel ? ` (${genderLabel})` : ''}`.trim();
  }

  private mapGender(ssmlGender: string): 'male' | 'female' | 'neutral' {
    switch (ssmlGender) {
      case 'MALE': return 'male';
      case 'FEMALE': return 'female';
      default: return 'neutral';
    }
  }

}

// Re-export for backwards compatibility
export { TtsRateLimitError as GoogleCloudRateLimitError } from '../utils/shared';
