import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ElevenLabsProvider, TtsRateLimitError } from '../../../src/tts/providers/elevenlabs.provider';

describe('ElevenLabsProvider', () => {
  let provider: ElevenLabsProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ELEVENLABS_API_KEY = 'test-key';
    process.env.ELEVENLABS_DEFAULT_VOICE_ID = 'voice-1';
    process.env.ELEVENLABS_MODEL_ID = 'eleven_v3';
    provider = new ElevenLabsProvider();
  });

  describe('synthesize', () => {
    it('should call ElevenLabs API with correct URL containing voice_id', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'audio/mpeg']]),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1000)),
      });
      global.fetch = mockFetch as any;

      await provider.synthesize('Hello', { voiceId: 'voice-123', speed: 1.0, format: 'mp3' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.elevenlabs.io/v1/text-to-speech/voice-123',
        expect.any(Object),
      );
    });

    it('should send text and model_id in request body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'audio/mpeg']]),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });
      global.fetch = mockFetch as any;

      await provider.synthesize('Test text', { voiceId: 'v1', speed: 1.0, format: 'mp3' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toBe('Test text');
      expect(body.model_id).toBe('eleven_v3');
    });

    it('should pass xi-api-key header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'audio/mpeg']]),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });
      global.fetch = mockFetch as any;

      await provider.synthesize('Text', { voiceId: 'v1', speed: 1.0, format: 'mp3' });

      expect(mockFetch.mock.calls[0][1].headers['xi-api-key']).toBe('test-key');
    });

    it('should pass voice_settings with speed parameter', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'audio/mpeg']]),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });
      global.fetch = mockFetch as any;

      await provider.synthesize('Text', { voiceId: 'v1', speed: 1.5, format: 'mp3' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.voice_settings.speed).toBe(1.5);
    });

    it('should return audio buffer from response', async () => {
      const audioData = new ArrayBuffer(500);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'audio/mpeg']]),
        arrayBuffer: () => Promise.resolve(audioData),
      });
      global.fetch = mockFetch as any;

      const result = await provider.synthesize('Text', { voiceId: 'v1', speed: 1.0, format: 'mp3' });

      expect(result.audioBuffer).toBeInstanceOf(Buffer);
      expect(result.audioBuffer.length).toBe(500);
    });

    it('should throw on 401 (invalid API key)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });
      global.fetch = mockFetch as any;

      await expect(
        provider.synthesize('Text', { voiceId: 'v1', speed: 1.0, format: 'mp3' }),
      ).rejects.toThrow('Invalid API key');
    });

    it('should throw TtsRateLimitError on 429 with retry-after header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Map([['retry-after', '30']]),
      });
      global.fetch = mockFetch as any;

      await expect(
        provider.synthesize('Text', { voiceId: 'v1', speed: 1.0, format: 'mp3' }),
      ).rejects.toThrow(TtsRateLimitError);
    });

    it('should throw on 500 (server error)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });
      global.fetch = mockFetch as any;

      await expect(
        provider.synthesize('Text', { voiceId: 'v1', speed: 1.0, format: 'mp3' }),
      ).rejects.toThrow('API error 500');
    });

    it('should validate response content-type is audio', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });
      global.fetch = mockFetch as any;

      await expect(
        provider.synthesize('Text', { voiceId: 'v1', speed: 1.0, format: 'mp3' }),
      ).rejects.toThrow('unexpected content-type');
    });
  });

  describe('getVoices', () => {
    it('should return list of voices from API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          voices: [
            { voice_id: 'v1', name: 'Georgian Voice', labels: { language: 'ka', gender: 'female' }, preview_url: 'url' },
          ],
        }),
      });
      global.fetch = mockFetch as any;

      const voices = await provider.getVoices();
      expect(voices).toHaveLength(1);
      expect(voices[0].id).toBe('v1');
      expect(voices[0].provider).toBe('elevenlabs');
    });

    it('should filter voices by language when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          voices: [
            { voice_id: 'v1', name: 'Georgian', labels: { language: 'ka', gender: 'female' } },
            { voice_id: 'v2', name: 'English', labels: { language: 'en', gender: 'male' } },
          ],
        }),
      });
      global.fetch = mockFetch as any;

      const voices = await provider.getVoices('ka');
      expect(voices).toHaveLength(1);
      expect(voices[0].language).toBe('ka');
    });
  });

  describe('configuration', () => {
    it('should return "elevenlabs" from getName()', () => {
      expect(provider.getName()).toBe('elevenlabs');
    });

    it('should return configured max chunk size', () => {
      process.env.TTS_CHUNK_MAX_BYTES = '5000';
      const p = new ElevenLabsProvider();
      expect(p.getMaxChunkSize()).toBe(5000);
    });

    it('should report available when API key is set', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch as any;

      const result = await provider.isAvailable();
      expect(result).toBe(true);
    });
  });
});
