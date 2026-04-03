import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fluent-ffmpeg before imports
vi.mock('fluent-ffmpeg', () => {
  const mockFfmpeg = vi.fn(() => ({
    input: vi.fn().mockReturnThis(),
    inputOptions: vi.fn().mockReturnThis(),
    audioCodec: vi.fn().mockReturnThis(),
    audioBitrate: vi.fn().mockReturnThis(),
    audioFrequency: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    on: vi.fn(function (this: any, event: string, handler: Function) {
      if (event === 'end') {
        // Simulate immediate completion
        setTimeout(() => handler(), 0);
      }
      return this;
    }),
    run: vi.fn(),
  }));
  (mockFfmpeg as any).ffprobe = vi.fn((_path: string, cb: Function) => {
    cb(null, { format: { duration: 5.0 } });
  });
  return { default: mockFfmpeg };
});

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(Buffer.from('fake-audio-data')),
      readdir: vi.fn().mockResolvedValue(['chunk-0.mp3', 'chunk-1.mp3', 'output.mp3', 'filelist.txt']),
      unlink: vi.fn().mockResolvedValue(undefined),
      rmdir: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import { concatenateAudioBuffers, getAudioDuration } from '../../../src/tts/utils/audio-concat';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('concatenateAudioBuffers', () => {
  it('should return combined buffer from multiple inputs', async () => {
    const buffers = [Buffer.from('audio1'), Buffer.from('audio2')];
    const result = await concatenateAudioBuffers(buffers);
    expect(result.buffer).toBeDefined();
    expect(result.fileSize).toBeGreaterThan(0);
  });

  it('should handle single buffer input (no concat needed)', async () => {
    const buffer = Buffer.from('single-audio');
    const result = await concatenateAudioBuffers([buffer]);
    expect(result.buffer).toBe(buffer);
    expect(result.durationMs).toBe(5000); // ffprobe returns 5.0 seconds
  });

  it('should return correct durationMs from ffprobe', async () => {
    const result = await concatenateAudioBuffers([Buffer.from('audio1'), Buffer.from('audio2')]);
    expect(result.durationMs).toBe(5000);
  });

  it('should return correct fileSize', async () => {
    const result = await concatenateAudioBuffers([Buffer.from('a'), Buffer.from('b')]);
    expect(result.fileSize).toBe(Buffer.from('fake-audio-data').length);
  });

  it('should clean up all temp files after success', async () => {
    const { promises: fsMock } = await import('fs');
    await concatenateAudioBuffers([Buffer.from('a'), Buffer.from('b')]);
    expect(fsMock.unlink).toHaveBeenCalled();
    expect(fsMock.rmdir).toHaveBeenCalled();
  });

  it('should throw when given empty buffer array', async () => {
    await expect(concatenateAudioBuffers([])).rejects.toThrow('No audio buffers');
  });
});

describe('getAudioDuration', () => {
  it('should return duration in milliseconds for valid audio', async () => {
    const duration = await getAudioDuration(Buffer.from('audio-data'));
    expect(duration).toBe(5000);
  });

  it('should estimate duration from buffer size on ffprobe error', async () => {
    const ffmpeg = await import('fluent-ffmpeg');
    (ffmpeg.default as any).ffprobe = vi.fn((_path: string, cb: Function) => {
      cb(new Error('ffprobe failed'), null);
    });

    const buffer = Buffer.alloc(16000); // 16000 bytes at 128kbps = 1 second
    const duration = await getAudioDuration(buffer);
    expect(duration).toBe(1000);
  });
});
