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
  private client!: S3Client;
  private bucket!: string;

  async onModuleInit() {
    this.bucket = process.env.AWS_S3_BUCKET || '';
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!this.bucket || !accessKeyId || !secretAccessKey) {
      if (process.env.NODE_ENV === 'test') {
        // Allow tests to run without real AWS credentials
        this.bucket = 'test-bucket';
        this.client = new S3Client({ region: 'eu-central-1' });
        return;
      }
      throw new Error('Missing required AWS environment variables: AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY');
    }

    this.client = new S3Client({
      region: region || 'eu-central-1',
      credentials: { accessKeyId, secretAccessKey },
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
        ServerSideEncryption: 'AES256',
        ContentDisposition: 'attachment',
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
    } catch (error: any) {
      if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
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
