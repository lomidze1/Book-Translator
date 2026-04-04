import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderManager } from '../../../src/tts/providers/provider-manager';

describe('ProviderManager', () => {
  let manager: ProviderManager;

  const createMockProvider = (name: string, available = true) => ({
    getName: vi.fn().mockReturnValue(name),
    isAvailable: vi.fn().mockResolvedValue(available),
    synthesize: vi.fn().mockResolvedValue({ audioBuffer: Buffer.from('audio'), durationMs: 5000 }),
    getVoices: vi.fn().mockResolvedValue([
      { id: `${name}-v1`, name: `${name} Voice`, language: 'ka', gender: 'female', provider: name },
    ]),
    getMaxChunkSize: vi.fn().mockReturnValue(5000),
  });

  const mockGoogle = createMockProvider('google-cloud');
  const mockElevenlabs = createMockProvider('elevenlabs');
  const mockAzure = createMockProvider('azure');

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.TTS_PRIMARY_PROVIDER = 'google-cloud';
    process.env.TTS_FALLBACK_PROVIDERS = 'elevenlabs,azure';
    process.env.TTS_HEALTH_CHECK_INTERVAL_MS = '9999999'; // Don't run periodic checks

    mockGoogle.isAvailable.mockResolvedValue(true);
    mockElevenlabs.isAvailable.mockResolvedValue(true);
    mockAzure.isAvailable.mockResolvedValue(true);

    manager = new ProviderManager(mockGoogle as any, mockElevenlabs as any, mockAzure as any);
    await manager.onModuleInit();
  });

  afterEach(async () => {
    await manager.onModuleDestroy();
    delete process.env.TTS_PRIMARY_PROVIDER;
    delete process.env.TTS_FALLBACK_PROVIDERS;
    delete process.env.TTS_HEALTH_CHECK_INTERVAL_MS;
  });

  describe('getProvider', () => {
    it('should return preferred provider when healthy', () => {
      const provider = manager.getProvider('elevenlabs');
      expect(provider.getName()).toBe('elevenlabs');
    });

    it('should return primary provider when no preference', () => {
      const provider = manager.getProvider();
      expect(provider.getName()).toBe('google-cloud');
    });

    it('should fallback when preferred is unhealthy', async () => {
      mockGoogle.isAvailable.mockResolvedValue(false);
      await manager.runHealthCheck();

      const provider = manager.getProvider('google-cloud');
      expect(provider.getName()).toBe('elevenlabs');
    });

    it('should use language-based selection for Georgian', () => {
      const provider = manager.getProvider(undefined, 'ka');
      expect(provider.getName()).toBe('google-cloud');
    });

    it('should use language-based selection for English', () => {
      const provider = manager.getProvider(undefined, 'en');
      expect(provider.getName()).toBe('elevenlabs');
    });

    it('should return primary even if unhealthy when all providers are down', async () => {
      mockGoogle.isAvailable.mockResolvedValue(false);
      mockElevenlabs.isAvailable.mockResolvedValue(false);
      mockAzure.isAvailable.mockResolvedValue(false);
      await manager.runHealthCheck();

      const provider = manager.getProvider();
      expect(provider.getName()).toBe('google-cloud');
    });
  });

  describe('synthesizeWithFallback', () => {
    const opts = { voiceId: 'v1', speed: 1.0, format: 'mp3' as const };

    it('should use primary provider when successful', async () => {
      const result = await manager.synthesizeWithFallback('text', opts);
      expect(result.usedProvider).toBe('google-cloud');
      expect(mockGoogle.synthesize).toHaveBeenCalled();
    });

    it('should fallback to second provider on primary failure', async () => {
      mockGoogle.synthesize.mockRejectedValueOnce(new Error('API error'));

      const result = await manager.synthesizeWithFallback('text', opts);
      expect(result.usedProvider).toBe('elevenlabs');
    });

    it('should fallback to third provider when first two fail', async () => {
      mockGoogle.synthesize.mockRejectedValueOnce(new Error('error'));
      mockElevenlabs.synthesize.mockRejectedValueOnce(new Error('error'));

      const result = await manager.synthesizeWithFallback('text', opts);
      expect(result.usedProvider).toBe('azure');
    });

    it('should throw when all providers fail', async () => {
      mockGoogle.synthesize.mockRejectedValueOnce(new Error('error1'));
      mockElevenlabs.synthesize.mockRejectedValueOnce(new Error('error2'));
      mockAzure.synthesize.mockRejectedValueOnce(new Error('error3'));

      await expect(
        manager.synthesizeWithFallback('text', opts),
      ).rejects.toThrow('ხმოვანი სინთეზი დროებით მიუწვდომელია');
    });

    it('should use preferred provider first', async () => {
      const result = await manager.synthesizeWithFallback('text', opts, 'azure');
      expect(result.usedProvider).toBe('azure');
    });

    it('should mark provider as unhealthy on failure', async () => {
      mockGoogle.synthesize.mockRejectedValueOnce(new Error('down'));

      await manager.synthesizeWithFallback('text', opts);
      expect(manager.isHealthy('google-cloud')).toBe(false);
    });
  });

  describe('estimateCost', () => {
    it('should calculate cost for google-cloud', () => {
      const estimate = manager.estimateCost(245000, 'google-cloud');
      expect(estimate.provider).toBe('google-cloud');
      expect(estimate.costUsd).toBe(0.98);
      expect(estimate.charCount).toBe(245000);
      expect(estimate.estimatedAudioMinutes).toBeGreaterThan(0);
    });

    it('should calculate cost for elevenlabs', () => {
      const estimate = manager.estimateCost(1000000, 'elevenlabs');
      expect(estimate.costUsd).toBe(5);
    });

    it('should use primary provider when none specified', () => {
      const estimate = manager.estimateCost(100000);
      expect(estimate.provider).toBe('google-cloud');
    });

    it('should estimate audio duration', () => {
      // 150 chars/sec → 100000 chars ≈ 666.67 sec ≈ 11.1 min
      const estimate = manager.estimateCost(100000);
      expect(estimate.estimatedAudioMinutes).toBeCloseTo(11.1, 0);
    });
  });

  describe('getAllVoices', () => {
    it('should aggregate voices from all healthy providers', async () => {
      const voices = await manager.getAllVoices('ka');
      expect(voices.length).toBeGreaterThanOrEqual(3);
      expect(mockGoogle.getVoices).toHaveBeenCalledWith('ka');
      expect(mockElevenlabs.getVoices).toHaveBeenCalledWith('ka');
      expect(mockAzure.getVoices).toHaveBeenCalledWith('ka');
    });

    it('should skip unhealthy providers', async () => {
      mockAzure.isAvailable.mockResolvedValue(false);
      await manager.runHealthCheck();

      await manager.getAllVoices();
      expect(mockAzure.getVoices).not.toHaveBeenCalled();
    });
  });

  describe('getAvailableProviders', () => {
    it('should return info for all providers', () => {
      const info = manager.getAvailableProviders();
      expect(info).toHaveLength(3);
      expect(info[0]).toEqual({
        name: 'google-cloud',
        available: true,
        languages: expect.arrayContaining(['ka', 'en']),
        costPerMillionChars: 4,
      });
    });

    it('should reflect health status', async () => {
      mockElevenlabs.isAvailable.mockResolvedValue(false);
      await manager.runHealthCheck();

      const info = manager.getAvailableProviders();
      const el = info.find((p) => p.name === 'elevenlabs');
      expect(el?.available).toBe(false);
    });
  });

  describe('health check', () => {
    it('should update status for each provider', async () => {
      mockGoogle.isAvailable.mockResolvedValue(true);
      mockElevenlabs.isAvailable.mockResolvedValue(false);
      mockAzure.isAvailable.mockResolvedValue(true);

      await manager.runHealthCheck();

      expect(manager.isHealthy('google-cloud')).toBe(true);
      expect(manager.isHealthy('elevenlabs')).toBe(false);
      expect(manager.isHealthy('azure')).toBe(true);
    });

    it('should detect provider recovery', async () => {
      mockElevenlabs.isAvailable.mockResolvedValue(false);
      await manager.runHealthCheck();
      expect(manager.isHealthy('elevenlabs')).toBe(false);

      mockElevenlabs.isAvailable.mockResolvedValue(true);
      await manager.runHealthCheck();
      expect(manager.isHealthy('elevenlabs')).toBe(true);
    });

    it('should handle isAvailable throwing', async () => {
      mockGoogle.isAvailable.mockRejectedValue(new Error('network'));
      await manager.runHealthCheck();
      expect(manager.isHealthy('google-cloud')).toBe(false);
    });
  });
});
