import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service implements OnModuleInit {
  private client: S3Client;
  private bucket: string;

  async onModuleInit() {
    this.bucket = process.env.AWS_S3_BUCKET || '';
    this.client = new S3Client({
      region: process.env.AWS_REGION || 'eu-central-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }

  /**
   * Upload a file to S3
   * @returns The S3 key (path) of the uploaded file
   */
  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return key;
  }

  /**
   * Generate a presigned URL for downloading/viewing a file
   * Default expiry: 1 hour
   */
  async getPresignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Delete a file from S3
   */
  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  /**
   * Check if a file exists in S3
   */
  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a standardized S3 key for book files
   * e.g. "books/abc123/original.pdf"
   */
  generateBookKey(bookId: string, filename: string): string {
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return `books/${bookId}/original${ext}`;
  }

  /**
   * Generate S3 key for translated content
   * e.g. "books/abc123/translations/tr456/chapter-1.txt"
   */
  generateTranslationKey(bookId: string, translationId: string, chapterNum: number): string {
    return `books/${bookId}/translations/${translationId}/chapter-${chapterNum}.txt`;
  }

  /**
   * Generate S3 key for audio files
   * e.g. "books/abc123/audio/ab789/chapter-1.mp3"
   */
  generateAudioKey(bookId: string, audioBookId: string, chapterNum: number, format = 'mp3'): string {
    return `books/${bookId}/audio/${audioBookId}/chapter-${chapterNum}.${format}`;
  }
}
