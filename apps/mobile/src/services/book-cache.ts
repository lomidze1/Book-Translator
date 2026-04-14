import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'book_cache_';
const CACHE_INDEX_KEY = 'book_cache_index';
const MAX_CACHE_BYTES = 200 * 1024 * 1024; // 200MB

interface CacheEntry {
  translationId: string;
  size: number;
  cachedAt: number;
}

interface TranslatedChapter {
  id: string;
  translatedContent: string;
  chapter: { number: number; title?: string };
}

class BookCacheService {
  private index: CacheEntry[] = [];
  private loaded = false;
  private mutex: Promise<void> = Promise.resolve();

  /** Serialize all index-mutating operations to prevent corruption */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.mutex.then(fn, fn);
    // Update mutex chain — swallow errors so the chain continues
    this.mutex = result.then(() => {}, () => {});
    return result;
  }

  private async loadIndex(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await AsyncStorage.getItem(CACHE_INDEX_KEY);
      if (raw) this.index = JSON.parse(raw);
    } catch {
      this.index = [];
    }
    this.loaded = true;
  }

  private async saveIndex(): Promise<void> {
    await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(this.index));
  }

  async cacheTranslation(translationId: string, chapters: TranslatedChapter[]): Promise<void> {
    return this.enqueue(async () => {
      await this.loadIndex();

      const json = JSON.stringify(chapters);
      const size = json.length * 2; // rough byte estimate for UTF-16

      await this.evictIfNeeded(size);
      await AsyncStorage.setItem(CACHE_PREFIX + translationId, json);

      this.index = this.index.filter((e) => e.translationId !== translationId);
      this.index.push({ translationId, size, cachedAt: Date.now() });
      await this.saveIndex();
    });
  }

  async getCachedTranslation(translationId: string): Promise<TranslatedChapter[] | null> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_PREFIX + translationId);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async isCached(translationId: string): Promise<boolean> {
    await this.loadIndex();
    return this.index.some((e) => e.translationId === translationId);
  }

  async removeCached(translationId: string): Promise<void> {
    return this.enqueue(async () => {
      await this.loadIndex();
      await AsyncStorage.removeItem(CACHE_PREFIX + translationId);
      this.index = this.index.filter((e) => e.translationId !== translationId);
      await this.saveIndex();
    });
  }

  async getCacheSize(): Promise<number> {
    await this.loadIndex();
    return this.index.reduce((sum, e) => sum + e.size, 0);
  }

  async clearAll(): Promise<void> {
    return this.enqueue(async () => {
      await this.loadIndex();
      const keys = this.index.map((e) => CACHE_PREFIX + e.translationId);
      if (keys.length > 0) await AsyncStorage.multiRemove(keys);
      this.index = [];
      await this.saveIndex();
    });
  }

  private async evictIfNeeded(newSize: number): Promise<void> {
    let total = this.index.reduce((sum, e) => sum + e.size, 0);
    if (total + newSize <= MAX_CACHE_BYTES) return;

    const sorted = [...this.index].sort((a, b) => a.cachedAt - b.cachedAt);
    for (const entry of sorted) {
      if (total + newSize <= MAX_CACHE_BYTES) break;
      await AsyncStorage.removeItem(CACHE_PREFIX + entry.translationId);
      this.index = this.index.filter((e) => e.translationId !== entry.translationId);
      total -= entry.size;
    }
    await this.saveIndex();
  }
}

export const bookCacheService = new BookCacheService();
