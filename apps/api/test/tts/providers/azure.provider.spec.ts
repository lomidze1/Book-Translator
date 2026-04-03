import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AzureProvider } from '../../../src/tts/providers/azure.provider';

describe('AzureProvider', () => {
  let provider: AzureProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AZURE_SPEECH_KEY = 'test-key';
    process.env.AZURE_SPEECH_REGION = 'westeurope';
    provider = new AzureProvider();
  });

  describe('synthesize', () => {
    it('should get access token from token endpoint', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('token-123') }) // token
        .mockResolvedValueOnce({
          ok: true, status: 200,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(1000)),
        }); // synthesis
      global.fetch = mockFetch as any;

      await provider.synthesize('Hello', { voiceId: 'ka-GE-voice', speed: 1.0, format: 'mp3' });

      expect(mockFetch.mock.calls[0][0]).toContain('issueToken');
      expect(mockFetch.mock.calls[0][1].headers['Ocp-Apim-Subscription-Key']).toBe('test-key');
    });

    it('should call TTS endpoint with Bearer token', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('token-abc') })
        .mockResolvedValueOnce({
          ok: true, status: 200,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(500)),
        });
      global.fetch = mockFetch as any;

      await provider.synthesize('Text', { voiceId: 'v1', speed: 1.0, format: 'mp3' });

      expect(mockFetch.mock.calls[1][1].headers['Authorization']).toBe('Bearer token-abc');
    });

    it('should send SSML body with correct voice and speed', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('token') })
        .mockResolvedValueOnce({
          ok: true, status: 200,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(500)),
        });
      global.fetch = mockFetch as any;

      await provider.synthesize('ტექსტი', { voiceId: 'ka-voice', speed: 1.5, format: 'mp3' });

      const body = mockFetch.mock.calls[1][1].body;
      expect(body).toContain('ka-voice');
      expect(body).toContain('150%');
    });

    it('should escape Georgian text in SSML', () => {
      const ssml = provider.buildSsml('ტექსტი <> & " \'', 'voice', 1.0);
      expect(ssml).toContain('&lt;');
      expect(ssml).toContain('&gt;');
      expect(ssml).toContain('&amp;');
      expect(ssml).toContain('&quot;');
      expect(ssml).toContain('&apos;');
    });

    it('should return audio buffer from response', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('token') })
        .mockResolvedValueOnce({
          ok: true, status: 200,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(800)),
        });
      global.fetch = mockFetch as any;

      const result = await provider.synthesize('Text', { voiceId: 'v1', speed: 1.0, format: 'mp3' });
      expect(result.audioBuffer).toBeInstanceOf(Buffer);
      expect(result.audioBuffer.length).toBe(800);
    });

    it('should throw on 429 (rate limit)', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('token') })
        .mockResolvedValueOnce({ ok: false, status: 429 });
      global.fetch = mockFetch as any;

      await expect(
        provider.synthesize('Text', { voiceId: 'v1', speed: 1.0, format: 'mp3' }),
      ).rejects.toThrow('rate limit');
    });

    it('should handle token refresh on 401', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('old-token') })
        .mockResolvedValueOnce({ ok: false, status: 401 }) // first attempt fails
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('new-token') }) // refresh
        .mockResolvedValueOnce({
          ok: true, status: 200,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(500)),
        }); // retry succeeds
      global.fetch = mockFetch as any;

      const result = await provider.synthesize('Text', { voiceId: 'v1', speed: 1.0, format: 'mp3' });
      expect(result.audioBuffer.length).toBe(500);
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('getVoices', () => {
    it('should return ka-GE voices from voices list endpoint', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('token') })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            { ShortName: 'ka-GE-Voice1', DisplayName: 'Georgian Voice', Locale: 'ka-GE', Gender: 'Female' },
            { ShortName: 'en-US-Voice1', DisplayName: 'English Voice', Locale: 'en-US', Gender: 'Male' },
          ]),
        });
      global.fetch = mockFetch as any;

      const voices = await provider.getVoices('ka');
      expect(voices).toHaveLength(1);
      expect(voices[0].language).toBe('ka-GE');
    });
  });

  describe('configuration', () => {
    it('should return "azure" from getName()', () => {
      expect(provider.getName()).toBe('azure');
    });

    it('should return 8000 from getMaxChunkSize()', () => {
      expect(provider.getMaxChunkSize()).toBe(8000);
    });
  });
});
