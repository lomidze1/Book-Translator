/**
 * Audio Cache Service — Phase 6
 *
 * FileSystem-based cache for offline audio playback.
 * Requires: expo-file-system
 *
 * Usage:
 *   const path = await audioCacheService.getCachedPath(chapterId);
 *   if (!path) await audioCacheService.cacheAudio(chapterId, remoteUrl);
 */

const CACHE_DIR = 'audio-cache/';
const MAX_CACHE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

export interface CacheEntry {
  chapterId: string;
  localPath: string;
  size: number;
  cachedAt: number;
}

class AudioCacheService {
  private cacheIndex: Map<string, CacheEntry> = new Map();
  private initialized = false;

  /**
   * Initialize cache — call once on app startup.
   * Loads existing cache index from filesystem.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import to avoid issues when expo-file-system is not installed
      const FileSystem = await this.getFileSystem();
      if (!FileSystem) return;

      const cacheDir = `${FileSystem.cacheDirectory}${CACHE_DIR}`;
      const info = await FileSystem.getInfoAsync(cacheDir);

      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
      }

      // Load cache index from stored JSON
      const indexPath = `${cacheDir}index.json`;
      const indexInfo = await FileSystem.getInfoAsync(indexPath);

      if (indexInfo.exists) {
        const content = await FileSystem.readAsStringAsync(indexPath);
        const entries: CacheEntry[] = JSON.parse(content);
        entries.forEach((e) => this.cacheIndex.set(e.chapterId, e));
      }

      this.initialized = true;
    } catch {
      // Cache initialization failed — continue without cache
    }
  }

  /**
   * Get cached audio file path, or null if not cached.
   */
  async getCachedPath(chapterId: string): Promise<string | null> {
    await this.init();

    const entry = this.cacheIndex.get(chapterId);
    if (!entry) return null;

    try {
      const FileSystem = await this.getFileSystem();
      if (!FileSystem) return null;

      const info = await FileSystem.getInfoAsync(entry.localPath);
      if (info.exists) return entry.localPath;

      // File was deleted externally — remove from index
      this.cacheIndex.delete(chapterId);
      await this.persistIndex();
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Download and cache audio from remote URL.
   */
  async cacheAudio(
    chapterId: string,
    remoteUrl: string,
    onProgress?: (progress: number) => void,
  ): Promise<string | null> {
    await this.init();

    try {
      const FileSystem = await this.getFileSystem();
      if (!FileSystem) return null;

      const cacheDir = `${FileSystem.cacheDirectory}${CACHE_DIR}`;
      const safeId = chapterId.replace(/[^a-zA-Z0-9_-]/g, '');
      const localPath = `${cacheDir}${safeId}.mp3`;

      const downloadResumable = FileSystem.createDownloadResumable(
        remoteUrl,
        localPath,
        {},
        (downloadProgress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
          const pct = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          onProgress?.(pct);
        },
      );

      const result = await downloadResumable.downloadAsync();
      if (!result) return null;

      const fileInfo = await FileSystem.getInfoAsync(localPath);
      const size = (fileInfo as any).size || 0;

      const entry: CacheEntry = {
        chapterId,
        localPath,
        size,
        cachedAt: Date.now(),
      };

      this.cacheIndex.set(chapterId, entry);
      await this.persistIndex();

      // Check total cache size and cleanup if needed
      await this.enforceSizeLimit();

      return localPath;
    } catch {
      return null;
    }
  }

  /**
   * Check if a chapter is cached.
   */
  isCached(chapterId: string): boolean {
    return this.cacheIndex.has(chapterId);
  }

  /**
   * Get total cache size in bytes.
   */
  getTotalSize(): number {
    let total = 0;
    for (const entry of this.cacheIndex.values()) {
      total += entry.size;
    }
    return total;
  }

  /**
   * Clear all cached audio.
   */
  async clearAll(): Promise<void> {
    try {
      const FileSystem = await this.getFileSystem();
      if (!FileSystem) return;

      const cacheDir = `${FileSystem.cacheDirectory}${CACHE_DIR}`;
      await FileSystem.deleteAsync(cacheDir, { idempotent: true });
      await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });

      this.cacheIndex.clear();
      await this.persistIndex();
    } catch {
      // ignore
    }
  }

  /**
   * Remove specific cached chapter.
   */
  async remove(chapterId: string): Promise<void> {
    const entry = this.cacheIndex.get(chapterId);
    if (!entry) return;

    try {
      const FileSystem = await this.getFileSystem();
      if (FileSystem) {
        await FileSystem.deleteAsync(entry.localPath, { idempotent: true });
      }
    } catch {
      // ignore
    }

    this.cacheIndex.delete(chapterId);
    await this.persistIndex();
  }

  /**
   * Enforce max cache size by removing oldest entries.
   */
  private async enforceSizeLimit(): Promise<void> {
    let totalSize = this.getTotalSize();
    if (totalSize <= MAX_CACHE_SIZE_BYTES) return;

    // Sort by cachedAt, oldest first
    const entries = [...this.cacheIndex.entries()].sort(
      (a, b) => a[1].cachedAt - b[1].cachedAt,
    );

    for (const [chapterId] of entries) {
      if (totalSize <= MAX_CACHE_SIZE_BYTES) break;
      const entry = this.cacheIndex.get(chapterId);
      if (entry) {
        totalSize -= entry.size;
        await this.remove(chapterId);
      }
    }
  }

  /**
   * Save cache index to filesystem.
   */
  private async persistIndex(): Promise<void> {
    try {
      const FileSystem = await this.getFileSystem();
      if (!FileSystem) return;

      const cacheDir = `${FileSystem.cacheDirectory}${CACHE_DIR}`;
      const indexPath = `${cacheDir}index.json`;
      const content = JSON.stringify([...this.cacheIndex.values()]);
      await FileSystem.writeAsStringAsync(indexPath, content);
    } catch {
      // ignore
    }
  }

  private async getFileSystem(): Promise<any | null> {
    try {
      return await import('expo-file-system');
    } catch {
      return null;
    }
  }
}

export const audioCacheService = new AudioCacheService();
