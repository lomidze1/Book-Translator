import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

export interface ConcatOptions {
  crossfadeMs?: number;
  format?: string;
  bitrate?: string;
  sampleRate?: number;
}

export interface ConcatResult {
  buffer: Buffer;
  durationMs: number;
  fileSize: number;
}

/**
 * Concatenate multiple audio buffers into a single audio file using ffmpeg
 */
export async function concatenateAudioBuffers(
  buffers: Buffer[],
  options?: ConcatOptions,
): Promise<ConcatResult> {
  if (buffers.length === 0) {
    throw new Error('No audio buffers to concatenate');
  }

  const format = options?.format || 'mp3';
  const bitrate = options?.bitrate || '128k';
  const sampleRate = options?.sampleRate || 24000;

  // Single buffer — just get duration
  if (buffers.length === 1) {
    const durationMs = await getAudioDuration(buffers[0]);
    return {
      buffer: buffers[0],
      durationMs,
      fileSize: buffers[0].length,
    };
  }

  const tempDir = join(tmpdir(), `tts-concat-${randomUUID()}`);
  const tempFiles: string[] = [];

  try {
    await fs.mkdir(tempDir, { recursive: true });

    // Write each buffer to temp file
    for (let i = 0; i < buffers.length; i++) {
      const tempPath = join(tempDir, `chunk-${i}.${format}`);
      await fs.writeFile(tempPath, buffers[i]);
      tempFiles.push(tempPath);
    }

    // Create concat file list
    const listPath = join(tempDir, 'filelist.txt');
    const listContent = tempFiles.map((f) => `file '${f}'`).join('\n');
    await fs.writeFile(listPath, listContent);

    // Output path
    const outputPath = join(tempDir, `output.${format}`);

    // Run ffmpeg concat
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .audioCodec('libmp3lame')
        .audioBitrate(bitrate)
        .audioFrequency(sampleRate)
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(new Error(`ffmpeg concat failed: ${err.message}`)))
        .run();
    });

    // Read output
    const outputBuffer = await fs.readFile(outputPath);
    const durationMs = await getAudioDuration(outputBuffer);

    return {
      buffer: outputBuffer,
      durationMs,
      fileSize: outputBuffer.length,
    };
  } finally {
    // Cleanup temp files
    await cleanupTempDir(tempDir);
  }
}

/**
 * Get audio duration in milliseconds using ffprobe
 */
export async function getAudioDuration(buffer: Buffer): Promise<number> {
  const tempPath = join(tmpdir(), `tts-probe-${randomUUID()}.mp3`);

  try {
    await fs.writeFile(tempPath, buffer);

    return new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(tempPath, (err, metadata) => {
        if (err) {
          // Fallback: estimate from buffer size (MP3 128kbps)
          const estimatedMs = Math.round((buffer.length * 8) / 128000 * 1000);
          resolve(estimatedMs);
          return;
        }
        const durationSec = metadata.format?.duration || 0;
        resolve(Math.round(durationSec * 1000));
      });
    });
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}

/**
 * Clean up temporary directory
 */
async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      await fs.unlink(join(dirPath, file)).catch(() => {});
    }
    await fs.rmdir(dirPath).catch(() => {});
  } catch {
    // Ignore cleanup errors
  }
}
