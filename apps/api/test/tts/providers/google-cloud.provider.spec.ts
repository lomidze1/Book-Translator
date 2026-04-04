import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleCloudProvider, GoogleCloudRateLimitError } from '../../../src/tts/providers/google-cloud.provider';

// Mock the entire @google-cloud/text-to-speech module
const mockSynthesizeSpeech = vi.fn();
const mockListVoices = vi.fn();
const mockClose = vi.fn();

vi.mock('@google-cloud/text-to-speech', () => ({
  TextToSpeechClient: class MockTextToSpeechClient {
    synthesizeSpeech = mockSynthesizeSpeech;
    listVoices = mockListVoices;
    close = mockClose;
  },
}));

describe('GoogleCloudProvider', () => {
  let provider: GoogleCloudProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLOUD_TTS_PROJECT_ID = 'test-project';
    process.env.GOOGLE_CLOUD_TTS_CREDENTIALS_PATH = '/path/to/creds.json';
    provider = new GoogleCloudProvider();
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLOUD_TTS_PROJECT_ID;
    delete process.env.GOOGLE_CLOUD_TTS_CREDENTIALS_PATH;
    delete process.env.TTS_CHUNK_MAX_BYTES_GOOGLE;
  });

  describe('getName', () => {
    it('should return "google-cloud"', () => {
      expect(provider.getName()).toBe('google-cloud');
    });
  });

  describe('getMaxChunkSize', () => {
    it('should return default 5000 bytes', () => {
      expect(provider.getMaxChunkSize()).toBe(5000);
    });

    it('should return configured value from env', () => {
      process.env.TTS_CHUNK_MAX_BYTES_GOOGLE = '6000';
      const p = new GoogleCloudProvider();
      expect(p.getMaxChunkSize()).toBe(6000);
    });
  });

  describe('isAvailable', () => {
    it('should return true when credentials are set and API responds', async () => {
      mockListVoices.mockResolvedValue([{ voices: [] }]);
      const result = await provider.isAvailable();
      expect(result).toBe(true);
    });

    it('should return false when API call fails', async () => {
      mockListVoices.mockRejectedValue(new Error('connection failed'));
      const result = await provider.isAvailable();
      expect(result).toBe(false);
    });

    it('should return false when no credentials are configured', async () => {
      delete process.env.GOOGLE_CLOUD_TTS_PROJECT_ID;
      delete process.env.GOOGLE_CLOUD_TTS_CREDENTIALS_PATH;
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const p = new GoogleCloudProvider();
      const result = await p.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('synthesize', () => {
    const defaultOptions = { voiceId: 'ka-GE-Neural2-A', speed: 1.0, format: 'mp3' as const };

    it('should call synthesizeSpeech with correct voice and language code', async () => {
      const audioContent = Buffer.from('fake-audio-data');
      mockSynthesizeSpeech.mockResolvedValue([{ audioContent }]);

      await provider.synthesize('გამარჯობა', defaultOptions);

      expect(mockSynthesizeSpeech).toHaveBeenCalledWith(
        expect.objectContaining({
          voice: {
            name: 'ka-GE-Neural2-A',
            languageCode: 'ka-GE',
          },
        }),
      );
    });

    it('should wrap text in SSML', async () => {
      const audioContent = Buffer.from('audio');
      mockSynthesizeSpeech.mockResolvedValue([{ audioContent }]);

      await provider.synthesize('ტესტი', defaultOptions);

      const callArgs = mockSynthesizeSpeech.mock.calls[0][0];
      expect(callArgs.input.ssml).toContain('<speak>');
      expect(callArgs.input.ssml).toContain('ტესტი');
      expect(callArgs.input.ssml).toContain('</speak>');
    });

    it('should apply speed via SSML prosody when speed != 1.0', async () => {
      const audioContent = Buffer.from('audio');
      mockSynthesizeSpeech.mockResolvedValue([{ audioContent }]);

      await provider.synthesize('ტესტი', { ...defaultOptions, speed: 1.5 });

      const callArgs = mockSynthesizeSpeech.mock.calls[0][0];
      expect(callArgs.input.ssml).toContain('<prosody rate="150%">');
    });

    it('should not wrap in prosody when speed is 1.0', async () => {
      const audioContent = Buffer.from('audio');
      mockSynthesizeSpeech.mockResolvedValue([{ audioContent }]);

      await provider.synthesize('ტესტი', defaultOptions);

      const callArgs = mockSynthesizeSpeech.mock.calls[0][0];
      expect(callArgs.input.ssml).not.toContain('<prosody');
    });

    it('should request MP3 encoding at specified sample rate', async () => {
      const audioContent = Buffer.from('audio');
      mockSynthesizeSpeech.mockResolvedValue([{ audioContent }]);

      await provider.synthesize('test', { ...defaultOptions, sampleRate: 48000 });

      expect(mockSynthesizeSpeech).toHaveBeenCalledWith(
        expect.objectContaining({
          audioConfig: expect.objectContaining({
            audioEncoding: 'MP3',
            sampleRateHertz: 48000,
          }),
        }),
      );
    });

    it('should return audio buffer and estimated duration', async () => {
      // 1000 bytes at 128kbps → ~62.5ms
      const audioContent = Buffer.alloc(1000);
      mockSynthesizeSpeech.mockResolvedValue([{ audioContent }]);

      const result = await provider.synthesize('test', defaultOptions);

      expect(result.audioBuffer).toBeInstanceOf(Buffer);
      expect(result.audioBuffer.length).toBe(1000);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should handle Uint8Array audioContent', async () => {
      const audioContent = new Uint8Array([1, 2, 3, 4, 5]);
      mockSynthesizeSpeech.mockResolvedValue([{ audioContent }]);

      const result = await provider.synthesize('test', defaultOptions);

      expect(result.audioBuffer).toBeInstanceOf(Buffer);
      expect(result.audioBuffer.length).toBe(5);
    });

    it('should throw on empty audio response', async () => {
      mockSynthesizeSpeech.mockResolvedValue([{ audioContent: null }]);

      await expect(
        provider.synthesize('test', defaultOptions),
      ).rejects.toThrow('empty audio response');
    });

    it('should throw on missing voiceId', async () => {
      await expect(
        provider.synthesize('test', { voiceId: '', speed: 1.0, format: 'mp3' }),
      ).rejects.toThrow('voiceId is required');
    });

    it('should throw specific error on UNAUTHENTICATED', async () => {
      mockSynthesizeSpeech.mockRejectedValue(new Error('UNAUTHENTICATED: invalid credentials'));

      await expect(
        provider.synthesize('test', defaultOptions),
      ).rejects.toThrow('invalid credentials');
    });

    it('should throw GoogleCloudRateLimitError on RESOURCE_EXHAUSTED', async () => {
      mockSynthesizeSpeech.mockRejectedValue(new Error('RESOURCE_EXHAUSTED: quota exceeded'));

      await expect(
        provider.synthesize('test', defaultOptions),
      ).rejects.toThrow(GoogleCloudRateLimitError);
    });

    it('should throw specific error on DEADLINE_EXCEEDED', async () => {
      mockSynthesizeSpeech.mockRejectedValue(new Error('DEADLINE_EXCEEDED'));

      await expect(
        provider.synthesize('test', defaultOptions),
      ).rejects.toThrow('request timeout');
    });

    it('should escape XML special characters in text', async () => {
      const audioContent = Buffer.from('audio');
      mockSynthesizeSpeech.mockResolvedValue([{ audioContent }]);

      await provider.synthesize('ტექსტი <tag> & "quotes"', defaultOptions);

      const callArgs = mockSynthesizeSpeech.mock.calls[0][0];
      expect(callArgs.input.ssml).toContain('&lt;tag&gt;');
      expect(callArgs.input.ssml).toContain('&amp;');
      expect(callArgs.input.ssml).toContain('&quot;quotes&quot;');
    });

    it('should throw when credentials are not configured', async () => {
      delete process.env.GOOGLE_CLOUD_TTS_PROJECT_ID;
      delete process.env.GOOGLE_CLOUD_TTS_CREDENTIALS_PATH;
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const p = new GoogleCloudProvider();

      await expect(
        p.synthesize('test', defaultOptions),
      ).rejects.toThrow('credentials not configured');
    });
  });

  describe('getVoices', () => {
    it('should return mapped voice list', async () => {
      mockListVoices.mockResolvedValue([{
        voices: [
          {
            name: 'ka-GE-Neural2-A',
            ssmlGender: 'FEMALE',
            languageCodes: ['ka-GE'],
            naturalSampleRateHertz: 24000,
          },
          {
            name: 'ka-GE-Neural2-B',
            ssmlGender: 'MALE',
            languageCodes: ['ka-GE'],
            naturalSampleRateHertz: 24000,
          },
        ],
      }]);

      const voices = await provider.getVoices('ka-GE');

      expect(voices).toHaveLength(2);
      expect(voices[0]).toEqual({
        id: 'ka-GE-Neural2-A',
        name: expect.stringContaining('Georgian'),
        language: 'ka-GE',
        gender: 'female',
        provider: 'google-cloud',
      });
      expect(voices[1].gender).toBe('male');
    });

    it('should return empty array when API fails', async () => {
      mockListVoices.mockRejectedValue(new Error('API error'));

      const voices = await provider.getVoices('ka-GE');
      expect(voices).toEqual([]);
    });

    it('should return empty array when no credentials', async () => {
      delete process.env.GOOGLE_CLOUD_TTS_PROJECT_ID;
      delete process.env.GOOGLE_CLOUD_TTS_CREDENTIALS_PATH;
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const p = new GoogleCloudProvider();

      const voices = await p.getVoices('ka-GE');
      expect(voices).toEqual([]);
    });

    it('should pass language filter to API', async () => {
      mockListVoices.mockResolvedValue([{ voices: [] }]);

      await provider.getVoices('en-US');

      expect(mockListVoices).toHaveBeenCalledWith({ languageCode: 'en-US' });
    });

    it('should call with empty language code when no filter', async () => {
      mockListVoices.mockResolvedValue([{ voices: [] }]);

      await provider.getVoices();

      expect(mockListVoices).toHaveBeenCalledWith({ languageCode: '' });
    });
  });

  describe('buildSsml', () => {
    it('should wrap text in <speak> tags', () => {
      const result = provider.buildSsml('გამარჯობა');
      expect(result).toBe('<speak>გამარჯობა</speak>');
    });

    it('should add prosody tag for non-1.0 speed', () => {
      const result = provider.buildSsml('ტესტი', 1.5);
      expect(result).toBe('<speak><prosody rate="150%">ტესტი</prosody></speak>');
    });

    it('should escape XML entities', () => {
      const result = provider.buildSsml('a < b & c > d');
      expect(result).toContain('&lt;');
      expect(result).toContain('&amp;');
      expect(result).toContain('&gt;');
    });

    it('should not add prosody for speed 1.0', () => {
      const result = provider.buildSsml('text', 1.0);
      expect(result).not.toContain('prosody');
    });
  });

  describe('language code extraction', () => {
    it('should extract ka-GE from ka-GE-Neural2-A', async () => {
      const audioContent = Buffer.from('audio');
      mockSynthesizeSpeech.mockResolvedValue([{ audioContent }]);

      await provider.synthesize('test', { voiceId: 'ka-GE-Neural2-A', speed: 1.0, format: 'mp3' });

      expect(mockSynthesizeSpeech).toHaveBeenCalledWith(
        expect.objectContaining({
          voice: expect.objectContaining({ languageCode: 'ka-GE' }),
        }),
      );
    });

    it('should extract en-US from en-US-Wavenet-C', async () => {
      const audioContent = Buffer.from('audio');
      mockSynthesizeSpeech.mockResolvedValue([{ audioContent }]);

      await provider.synthesize('test', { voiceId: 'en-US-Wavenet-C', speed: 1.0, format: 'mp3' });

      expect(mockSynthesizeSpeech).toHaveBeenCalledWith(
        expect.objectContaining({
          voice: expect.objectContaining({ languageCode: 'en-US' }),
        }),
      );
    });
  });
});
