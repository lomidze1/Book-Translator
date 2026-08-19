import { describe, it, expect, vi, beforeEach } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

type BookCacheService = (typeof import('@/services/book-cache'))['bookCacheService'];

const chapters = (content: string) => [
  { id: 'c1', translatedContent: content, chapter: { number: 1, title: 'თავი 1' } },
];

// The service is a stateful singleton — re-import per test so the in-memory
// index never leaks between tests.
let bookCacheService: BookCacheService;

beforeEach(async () => {
  vi.resetModules();
  ({ bookCacheService } = await import('@/services/book-cache'));
});

describe('bookCacheService.cacheTranslation', () => {
  it('stores chapters and marks the translation as cached', async () => {
    await bookCacheService.cacheTranslation('t1', chapters('გამარჯობა'));

    expect(await bookCacheService.isCached('t1')).toBe(true);
    expect(await bookCacheService.getCachedTranslation('t1')).toEqual(chapters('გამარჯობა'));
  });

  it('replaces the previous entry when caching the same translation twice', async () => {
    await bookCacheService.cacheTranslation('t1', chapters('first version, quite long'));
    await bookCacheService.cacheTranslation('t1', chapters('v2'));

    expect(await bookCacheService.getCachedTranslation('t1')).toEqual(chapters('v2'));
    // A single index entry remains — size reflects only the latest payload
    const expectedSize = JSON.stringify(chapters('v2')).length * 2;
    expect(await bookCacheService.getCacheSize()).toBe(expectedSize);
  });
});

describe('bookCacheService.isCached', () => {
  it('is false for a translation that was never cached', async () => {
    expect(await bookCacheService.isCached('nope')).toBe(false);
  });

  it('survives a corrupt index by treating it as empty', async () => {
    await AsyncStorage.setItem('book_cache_index', '!not-json');

    expect(await bookCacheService.isCached('t1')).toBe(false);
    // Caching still works after recovery
    await bookCacheService.cacheTranslation('t1', chapters('ok'));
    expect(await bookCacheService.isCached('t1')).toBe(true);
  });
});

describe('bookCacheService.getCachedTranslation', () => {
  it('returns null for an unknown translation', async () => {
    expect(await bookCacheService.getCachedTranslation('nope')).toBeNull();
  });

  it('returns null when the stored payload is corrupt JSON', async () => {
    await AsyncStorage.setItem('book_cache_t1', '{broken');

    expect(await bookCacheService.getCachedTranslation('t1')).toBeNull();
  });
});

describe('bookCacheService.removeCached', () => {
  it('removes the payload and the index entry', async () => {
    await bookCacheService.cacheTranslation('t1', chapters('bye'));
    await bookCacheService.removeCached('t1');

    expect(await bookCacheService.isCached('t1')).toBe(false);
    expect(await bookCacheService.getCachedTranslation('t1')).toBeNull();
    expect(await AsyncStorage.getItem('book_cache_t1')).toBeNull();
  });
});

describe('bookCacheService.getCacheSize', () => {
  it('sums the sizes of all cached translations', async () => {
    await bookCacheService.cacheTranslation('t1', chapters('one'));
    await bookCacheService.cacheTranslation('t2', chapters('another one'));

    const expected =
      JSON.stringify(chapters('one')).length * 2 + JSON.stringify(chapters('another one')).length * 2;
    expect(await bookCacheService.getCacheSize()).toBe(expected);
  });
});

describe('bookCacheService.clearAll', () => {
  it('removes every payload and empties the index', async () => {
    await bookCacheService.cacheTranslation('t1', chapters('one'));
    await bookCacheService.cacheTranslation('t2', chapters('two'));

    await bookCacheService.clearAll();

    expect(await bookCacheService.isCached('t1')).toBe(false);
    expect(await bookCacheService.getCacheSize()).toBe(0);
    expect(await AsyncStorage.getItem('book_cache_t1')).toBeNull();
    expect(await AsyncStorage.getItem('book_cache_t2')).toBeNull();
  });
});

describe('bookCacheService index persistence', () => {
  it('sees translations cached by a previous service instance', async () => {
    await bookCacheService.cacheTranslation('t1', chapters('persisted'));

    vi.resetModules();
    const { bookCacheService: fresh } = await import('@/services/book-cache');

    expect(await fresh.isCached('t1')).toBe(true);
    expect(await fresh.getCachedTranslation('t1')).toEqual(chapters('persisted'));
  });
});
