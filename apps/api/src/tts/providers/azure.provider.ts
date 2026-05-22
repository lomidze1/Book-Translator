import { Injectable, Logger } from '@nestjs/common';
import { TtsProvider, TtsOptions, TtsSynthesisResult, Voice } from './tts-provider.interface';
import { escapeXml, estimateMp3Duration } from '../utils/shared';
import { fetchWithTimeout } from '../../common/fetch';

@Injectable()
export class AzureProvider implements TtsProvider {
  private readonly logger = new Logger(AzureProvider.name);
  private readonly speechKey: string;
  private readonly region: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.speechKey = process.env.AZURE_SPEECH_KEY || '';
    this.region = process.env.AZURE_SPEECH_REGION || 'westeurope';
  }

  getName(): string {
    return 'azure';
  }

  getMaxChunkSize(): number {
    return 8000;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.speechKey) return false;
    try {
      await this.getAccessToken();
      return true;
    } catch {
      return false;
    }
  }

  async synthesize(text: string, options: TtsOptions): Promise<TtsSynthesisResult> {
    if (!this.speechKey) throw new Error('Azure: Speech key not configured');

    const token = await this.getAccessToken();
    const ssml = this.buildSsml(text, options.voiceId, options.speed);
    const ttsUrl = `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const ttsHeaders = (bearerToken: string) => ({
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
    });

    const res = await fetchWithTimeout(
      ttsUrl,
      { method: 'POST', headers: ttsHeaders(token), body: ssml },
      30_000,
    );

    if (res.status === 401) {
      // Token expired, refresh and retry once
      this.accessToken = null;
      const newToken = await this.getAccessToken();
      const retryRes = await fetchWithTimeout(
        ttsUrl,
        { method: 'POST', headers: ttsHeaders(newToken), body: ssml },
        30_000,
      );
      if (!retryRes.ok) throw new Error(`Azure TTS error ${retryRes.status}`);
      const arrayBuffer = await retryRes.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);
      const durationMs = estimateMp3Duration(audioBuffer.length);
      return { audioBuffer, durationMs };
    }

    if (res.status === 429) {
      throw new Error('Azure TTS rate limit exceeded');
    }

    if (!res.ok) {
      throw new Error(`Azure TTS error ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    const durationMs = estimateMp3Duration(audioBuffer.length);

    return { audioBuffer, durationMs };
  }

  async getVoices(language?: string): Promise<Voice[]> {
    if (!this.speechKey) return [];

    const token = await this.getAccessToken();
    const res = await fetchWithTimeout(
      `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
      { headers: { Authorization: `Bearer ${token}` } },
      10_000,
    );

    if (!res.ok) return [];

    const voices = (await res.json()) as any[];
    const mapped: Voice[] = voices.map((v) => ({
      id: v.ShortName,
      name: v.DisplayName,
      language: v.Locale,
      gender: v.Gender?.toLowerCase() || 'neutral',
      provider: 'azure',
    }));

    if (language) {
      return mapped.filter((v) =>
        v.language.toLowerCase().startsWith(language.toLowerCase()),
      );
    }

    return mapped;
  }

  private async getAccessToken(): Promise<string> {
    // Reuse token if not expired (tokens last 10 minutes)
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const res = await fetchWithTimeout(
      `https://${this.region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.speechKey,
          'Content-Length': '0',
        },
      },
      8_000,
    );

    if (!res.ok) {
      throw new Error(`Azure token request failed: ${res.status}`);
    }

    this.accessToken = await res.text();
    this.tokenExpiry = Date.now() + 9 * 60 * 1000; // 9 minutes
    return this.accessToken;
  }

  buildSsml(text: string, voiceId: string, speed: number): string {
    const escapedText = escapeXml(text);
    const rate = speed === 1.0 ? 'default' : `${Math.round(speed * 100)}%`;

    const safeVoiceId = escapeXml(voiceId);
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ka-GE">
  <voice name="${safeVoiceId}">
    <prosody rate="${rate}">
      ${escapedText}
    </prosody>
  </voice>
</speak>`;
  }

}
