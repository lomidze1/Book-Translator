export interface TtsOptions {
  voiceId: string;
  speed: number;
  format: 'mp3' | 'ogg';
  sampleRate?: number;
}

export interface TtsSynthesisResult {
  audioBuffer: Buffer;
  durationMs: number;
}

export interface Voice {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female' | 'neutral';
  provider: string;
  previewUrl?: string;
}

export interface TimestampEntry {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TtsProvider {
  synthesize(text: string, options: TtsOptions): Promise<TtsSynthesisResult>;
  getVoices(language?: string): Promise<Voice[]>;
  getMaxChunkSize(): number;
  getName(): string;
  isAvailable(): Promise<boolean>;
}
