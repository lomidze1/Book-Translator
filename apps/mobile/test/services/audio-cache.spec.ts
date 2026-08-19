import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory expo-file-system fake shared by all tests in this file.
const fs = vi.hoisted(() => ({
  files: new Map<string, string>(),
  sizes: new Map<string, number>(),
  dirs: new Set<string>(),
  downloadFails: false,
  nextDownloadSize: 1000,
}));

vi.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: vi.fn(async (path: string) => {
    if (fs.dirs.has(path)) return { exists: true, isDirectory: true };
    if (fs.files.has(path)) return { exists: true, size: fs.sizes.get(path) ?? 0 };
    return { exists: false };
  }),
  makeDirectoryAsync: vi.fn(async (path: string) => {
    fs.dirs.add(path);
  }),
  readAsStringAsync: vi.fn(async (path: string) => {
    if (!fs.files.has(path)) throw new Error(`ENOENT: ${path}`);
    return fs.files.get(path)!;
  }),
  writeAsStringAsync: vi.fn(async (path: string, content: string) => {
    fs.files.set(path, content);
    fs.sizes.set(path, content.length);
  }),
  deleteAsync: vi.fn(async (path: string) => {
    fs.dirs.delete(path);
    for (const key of [...fs.files.keys()]) {
      if (key === path || key.startsWith(path)) {
        fs.files.delete(key);
        fs.sizes.delete(key);
      }
    }
  }),
  createDownloadResumable: vi.fn(
    (
      _url: string,
      localPath: string,
      _options: unknown,
      onProgress?: (p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
    ) => ({
      downloadAsync: async () => {
        if (fs.downloadFails) return undefined;
        onProgress?.({ totalBytesWritten: 50, totalBytesExpectedToWrite: 100 });
        onProgress?.({ totalBytesWritten: 100, totalBytesExpectedToWrite: 100 });
        fs.files.set(localPath, 'audio-bytes');
        fs.sizes.set(localPath, fs.nextDownloadSize);
        return { uri: localPath };
      },
    }),
  ),
}));

const CACHE_DIR = 'file:///cache/audio-cache/';

type AudioCacheService = (typeof import('@/services/audio-cache'))['audioCacheService'];

// Stateful singleton — fresh instance per test.
let audioCacheService: AudioCacheService;

beforeEach(async () => {
  fs.files.clear();
  fs.sizes.clear();
  fs.dirs.clear();
  fs.downloadFails = false;
  fs.nextDownloadSize = 1000;
  vi.resetModules();
  ({ audioCacheService } = await import('@/services/audio-cache'));
});

describe('audioCacheService.init', () => {
  it('creates the cache directory when it does not exist', async () => {
    await audioCacheService.init();

    expect(fs.dirs.has(CACHE_DIR)).toBe(true);
  });

  it('loads a persisted index so entries survive restarts', async () => {
    fs.nextDownloadSize = 777;
    await audioCacheService.cacheAudio('ch1', 'https://cdn/ch1.mp3');

    vi.resetModules();
    const { audioCacheService: fresh } = await import('@/services/audio-cache');
    await fresh.init();

    expect(fresh.isCached('ch1')).toBe(true);
    expect(fresh.getTotalSize()).toBe(777);
  });
});

describe('audioCacheService.cacheAudio', () => {
  it('downloads the file, reports progress, and returns the local path', async () => {
    const progress: number[] = [];

    const path = await audioCacheService.cacheAudio('ch1', 'https://cdn/ch1.mp3', (p) =>
      progress.push(p),
    );

    expect(path).toBe(`${CACHE_DIR}ch1.mp3`);
    expect(progress).toEqual([0.5, 1]);
    expect(audioCacheService.isCached('ch1')).toBe(true);
    expect(audioCacheService.getTotalSize()).toBe(1000);
  });

  it('sanitizes unsafe characters out of the file name', async () => {
    const path = await audioCacheService.cacheAudio('ch/1 ../x!', 'https://cdn/a.mp3');

    expect(path).toBe(`${CACHE_DIR}ch1x.mp3`);
  });

  it('returns null when the download yields no result', async () => {
    fs.downloadFails = true;

    const path = await audioCacheService.cacheAudio('ch1', 'https://cdn/ch1.mp3');

    expect(path).toBeNull();
    expect(audioCacheService.isCached('ch1')).toBe(false);
  });

  it('evicts the oldest entries when the cache exceeds its size limit', async () => {
    fs.nextDownloadSize = 400 * 1024 * 1024;
    await audioCacheService.cacheAudio('old', 'https://cdn/old.mp3');
    await audioCacheService.cacheAudio('new', 'https://cdn/new.mp3');

    expect(audioCacheService.isCached('old')).toBe(false);
    expect(audioCacheService.isCached('new')).toBe(true);
    expect(audioCacheService.getTotalSize()).toBe(400 * 1024 * 1024);
  });
});

describe('audioCacheService.getCachedPath', () => {
  it('returns the local path when the cached file still exists', async () => {
    await audioCacheService.cacheAudio('ch1', 'https://cdn/ch1.mp3');

    expect(await audioCacheService.getCachedPath('ch1')).toBe(`${CACHE_DIR}ch1.mp3`);
  });

  it('returns null for a chapter that was never cached', async () => {
    expect(await audioCacheService.getCachedPath('nope')).toBeNull();
  });

  it('drops the index entry when the file was deleted externally', async () => {
    await audioCacheService.cacheAudio('ch1', 'https://cdn/ch1.mp3');
    fs.files.delete(`${CACHE_DIR}ch1.mp3`);

    expect(await audioCacheService.getCachedPath('ch1')).toBeNull();
    expect(audioCacheService.isCached('ch1')).toBe(false);
  });
});

describe('audioCacheService.remove', () => {
  it('deletes the file and forgets the entry', async () => {
    await audioCacheService.cacheAudio('ch1', 'https://cdn/ch1.mp3');

    await audioCacheService.remove('ch1');

    expect(audioCacheService.isCached('ch1')).toBe(false);
    expect(fs.files.has(`${CACHE_DIR}ch1.mp3`)).toBe(false);
    expect(audioCacheService.getTotalSize()).toBe(0);
  });

  it('is a no-op for an unknown chapter', async () => {
    await expect(audioCacheService.remove('nope')).resolves.toBeUndefined();
  });
});

describe('audioCacheService.clearAll', () => {
  it('wipes all files, recreates the directory, and resets the index', async () => {
    await audioCacheService.cacheAudio('ch1', 'https://cdn/ch1.mp3');
    await audioCacheService.cacheAudio('ch2', 'https://cdn/ch2.mp3');

    await audioCacheService.clearAll();

    expect(audioCacheService.isCached('ch1')).toBe(false);
    expect(audioCacheService.isCached('ch2')).toBe(false);
    expect(audioCacheService.getTotalSize()).toBe(0);
    expect(fs.dirs.has(CACHE_DIR)).toBe(true);
    expect(fs.files.has(`${CACHE_DIR}ch1.mp3`)).toBe(false);
  });
});
