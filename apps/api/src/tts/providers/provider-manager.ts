import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { TtsProvider, TtsOptions, TtsSynthesisResult, Voice } from './tts-provider.interface';
import { GoogleCloudProvider } from './google-cloud.provider';
import { ElevenLabsProvider } from './elevenlabs.provider';
import { AzureProvider } from './azure.provider';
import { COST_PER_MILLION_CHARS, CHARS_PER_AUDIO_SECOND } from '../utils/shared';

export interface CostEstimate {
  provider: string;
  charCount: number;
  costUsd: number;
  estimatedAudioMinutes: number;
}

export interface ProviderInfo {
  name: string;
  available: boolean;
  languages: string[];
  costPerMillionChars: number;
}

@Injectable()
export class ProviderManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProviderManager.name);
  private readonly healthStatus = new Map<string, boolean>();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private readonly providers: TtsProvider[];

  constructor(
    private readonly googleCloud: GoogleCloudProvider,
    private readonly elevenlabs: ElevenLabsProvider,
    private readonly azure: AzureProvider,
  ) {
    this.providers = [googleCloud, elevenlabs, azure];
  }

  async onModuleInit(): Promise<void> {
    // Initial health check
    await this.runHealthCheck();

    // Periodic health check
    const intervalMs = parseInt(process.env.TTS_HEALTH_CHECK_INTERVAL_MS || '300000');
    this.healthCheckInterval = setInterval(() => {
      this.runHealthCheck().catch((err) =>
        this.logger.error(`Health check error: ${err}`),
      );
    }, intervalMs);

    this.logger.log('ProviderManager initialized');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  /**
   * Get the best available provider based on preference and health status.
   */
  getProvider(preferred?: string, language?: string): TtsProvider {
    // 1. If preferred is specified and healthy, use it
    if (preferred) {
      const provider = this.findProvider(preferred);
      if (provider && this.isHealthy(preferred)) {
        return provider;
      }
    }

    // 2. Language-based selection
    if (language) {
      const langProvider = this.getProviderForLanguage(language);
      if (langProvider && this.isHealthy(langProvider.getName())) {
        return langProvider;
      }
    }

    // 3. Priority-based fallback from env or default order
    const fallbackOrder = this.getFallbackOrder();
    for (const name of fallbackOrder) {
      const provider = this.findProvider(name);
      if (provider && this.isHealthy(name)) {
        return provider;
      }
    }

    // 4. Last resort: return primary even if unhealthy
    const primary = process.env.TTS_PRIMARY_PROVIDER || 'google-cloud';
    return this.findProvider(primary) || this.googleCloud;
  }

  /**
   * Synthesize with automatic fallback on provider failure.
   */
  async synthesizeWithFallback(
    text: string,
    options: TtsOptions,
    preferred?: string,
  ): Promise<TtsSynthesisResult & { usedProvider: string }> {
    const errors: Array<{ provider: string; error: string }> = [];
    const tried = new Set<string>();

    // Build ordered list: preferred first, then fallbacks
    const order = this.buildProviderOrder(preferred);

    for (const name of order) {
      if (tried.has(name)) continue;
      tried.add(name);

      const provider = this.findProvider(name);
      if (!provider) continue;

      try {
        const result = await provider.synthesize(text, options);
        return { ...result, usedProvider: name };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ provider: name, error: msg });
        this.logger.warn(`Provider ${name} failed: ${msg}, trying next...`);
        this.healthStatus.set(name, false);
      }
    }

    this.logger.error(
      `All TTS providers failed: ${errors.map((e) => `${e.provider}: ${e.error}`).join('; ')}`,
    );
    throw new Error('ხმოვანი სინთეზი დროებით მიუწვდომელია. სცადეთ მოგვიანებით.');
  }

  /**
   * Estimate cost for a given text.
   */
  estimateCost(charCount: number, providerName?: string): CostEstimate {
    const name = providerName || process.env.TTS_PRIMARY_PROVIDER || 'google-cloud';
    const costPerMillion = COST_PER_MILLION_CHARS[name] || 4;
    const costUsd = (charCount / 1_000_000) * costPerMillion;
    const estimatedAudioMinutes = charCount / CHARS_PER_AUDIO_SECOND / 60;

    return {
      provider: name,
      charCount,
      costUsd: Math.round(costUsd * 100) / 100,
      estimatedAudioMinutes: Math.round(estimatedAudioMinutes * 10) / 10,
    };
  }

  /**
   * Get available voices from all healthy providers.
   */
  async getAllVoices(language?: string): Promise<Voice[]> {
    const allVoices: Voice[] = [];

    for (const provider of this.providers) {
      if (!this.isHealthy(provider.getName())) continue;
      try {
        const voices = await provider.getVoices(language);
        allVoices.push(...voices);
      } catch {
        // Skip failed providers
      }
    }

    return allVoices;
  }

  /**
   * Get info about all providers.
   */
  getAvailableProviders(): ProviderInfo[] {
    return this.providers.map((p) => ({
      name: p.getName(),
      available: this.isHealthy(p.getName()),
      languages: this.getProviderLanguages(p.getName()),
      costPerMillionChars: COST_PER_MILLION_CHARS[p.getName()] || 0,
    }));
  }

  isHealthy(name: string): boolean {
    return this.healthStatus.get(name) ?? false;
  }

  async runHealthCheck(): Promise<void> {
    for (const provider of this.providers) {
      try {
        const available = await provider.isAvailable();
        const wasAvailable = this.healthStatus.get(provider.getName());
        this.healthStatus.set(provider.getName(), available);

        if (wasAvailable !== undefined && wasAvailable !== available) {
          this.logger.log(
            `Provider ${provider.getName()} status changed: ${available ? '✅ UP' : '❌ DOWN'}`,
          );
        }
      } catch {
        this.healthStatus.set(provider.getName(), false);
      }
    }
  }

  private findProvider(name: string): TtsProvider | undefined {
    return this.providers.find((p) => p.getName() === name);
  }

  private getFallbackOrder(): string[] {
    const primary = process.env.TTS_PRIMARY_PROVIDER || 'google-cloud';
    const fallbacks = process.env.TTS_FALLBACK_PROVIDERS?.split(',').map((s) => s.trim()) || [];

    const order = [primary, ...fallbacks];
    // Add any remaining providers not in the list
    for (const p of this.providers) {
      if (!order.includes(p.getName())) {
        order.push(p.getName());
      }
    }
    return order;
  }

  private buildProviderOrder(preferred?: string): string[] {
    const fallback = this.getFallbackOrder();
    if (!preferred) return fallback;
    return [preferred, ...fallback.filter((n) => n !== preferred)];
  }

  private getProviderForLanguage(language: string): TtsProvider | null {
    const lang = language.toLowerCase();
    // Georgian → Google Cloud (best Neural2 support)
    if (lang.startsWith('ka')) return this.googleCloud;
    // English → ElevenLabs (highest quality)
    if (lang.startsWith('en')) return this.elevenlabs;
    // Others → Google Cloud (broadest language support)
    return this.googleCloud;
  }

  private getProviderLanguages(name: string): string[] {
    switch (name) {
      case 'google-cloud': return ['ka', 'en', 'ru', 'de', 'fr', 'es', 'it', 'ja', 'zh'];
      case 'elevenlabs': return ['en', 'es', 'fr', 'de', 'it', 'pt', 'pl'];
      case 'azure': return ['ka', 'en', 'ru', 'de', 'fr', 'es', 'it', 'ja', 'zh'];
      default: return [];
    }
  }
}
