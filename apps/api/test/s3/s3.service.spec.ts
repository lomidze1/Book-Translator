import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3Service } from '../../src/s3/s3.service';

// Mock AWS SDK
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn();
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
    PutObjectCommand: vi.fn().mockImplementation((input) => ({ input, _type: 'PutObject' })),
    GetObjectCommand: vi.fn().mockImplementation((input) => ({ input, _type: 'GetObject' })),
    DeleteObjectCommand: vi.fn().mockImplementation((input) => ({ input, _type: 'DeleteObject' })),
    HeadObjectCommand: vi.fn().mockImplementation((input) => ({ input, _type: 'HeadObject' })),
    __mockSend: mockSend,
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

// Get mocked send function
import { __mockSend as mockSend } from '@aws-sdk/client-s3';
import {
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

describe('S3Service', () => {
  let s3Service: S3Service;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.AWS_S3_BUCKET = 'test-bucket';
    process.env.AWS_REGION = 'eu-central-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';

    s3Service = new S3Service();
    await s3Service.onModuleInit();
  });

  // ========================
  // upload
  // ========================

  describe('upload', () => {
    it('should upload a file and return the key', async () => {
      (mockSend as any).mockResolvedValue({});

      const result = await s3Service.upload('books/123/original.pdf', Buffer.from('pdf data'), 'application/pdf');

      expect(result).toBe('books/123/original.pdf');
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'books/123/original.pdf',
        Body: expect.any(Buffer),
        ContentType: 'application/pdf',
        ServerSideEncryption: 'AES256',
        ContentDisposition: 'attachment',
      });
    });

    it('should throw on S3 failure', async () => {
      (mockSend as any).mockRejectedValue(new Error('S3 upload failed'));

      await expect(
        s3Service.upload('key', Buffer.from('data'), 'text/plain'),
      ).rejects.toThrow('S3 upload failed');
    });
  });

  // ========================
  // getPresignedUrl
  // ========================

  describe('getPresignedUrl', () => {
    it('should return a presigned URL with default expiry', async () => {
      const url = await s3Service.getPresignedUrl('books/123/original.pdf');

      expect(url).toBe('https://s3.example.com/presigned-url');
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 3600 },
      );
    });

    it('should respect custom expiry', async () => {
      await s3Service.getPresignedUrl('key', 7200);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 7200 },
      );
    });
  });

  // ========================
  // delete
  // ========================

  describe('delete', () => {
    it('should send DeleteObjectCommand', async () => {
      (mockSend as any).mockResolvedValue({});

      await s3Service.delete('books/123/original.pdf');

      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'books/123/original.pdf',
      });
    });

    it('should throw on S3 failure', async () => {
      (mockSend as any).mockRejectedValue(new Error('Access denied'));

      await expect(s3Service.delete('key')).rejects.toThrow('Access denied');
    });
  });

  // ========================
  // exists
  // ========================

  describe('exists', () => {
    it('should return true when file exists', async () => {
      (mockSend as any).mockResolvedValue({});

      const result = await s3Service.exists('books/123/original.pdf');

      expect(result).toBe(true);
      expect(HeadObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'books/123/original.pdf',
      });
    });

    it('should return false when file does not exist (NotFound)', async () => {
      const notFoundError = new Error('NotFound');
      notFoundError.name = 'NotFound';
      (mockSend as any).mockRejectedValue(notFoundError);

      const result = await s3Service.exists('nonexistent-key');

      expect(result).toBe(false);
    });

    it('should return false when file does not exist (404)', async () => {
      const error = Object.assign(new Error('Not Found'), { $metadata: { httpStatusCode: 404 } });
      (mockSend as any).mockRejectedValue(error);

      const result = await s3Service.exists('nonexistent-key');

      expect(result).toBe(false);
    });

    it('should rethrow non-NotFound errors', async () => {
      (mockSend as any).mockRejectedValue(new Error('Access Denied'));

      await expect(s3Service.exists('some-key')).rejects.toThrow('Access Denied');
    });
  });

  // ========================
  // Key Generators
  // ========================

  describe('generateBookKey', () => {
    it('should generate correct key for PDF', () => {
      const key = s3Service.generateBookKey('abc123', 'my-book.pdf');
      expect(key).toBe('books/abc123/original.pdf');
    });

    it('should generate correct key for EPUB', () => {
      const key = s3Service.generateBookKey('abc123', 'book.epub');
      expect(key).toBe('books/abc123/original.epub');
    });

    it('should handle uppercase extensions', () => {
      const key = s3Service.generateBookKey('abc123', 'Book.PDF');
      expect(key).toBe('books/abc123/original.pdf');
    });

    it('should handle filenames with multiple dots', () => {
      const key = s3Service.generateBookKey('abc123', 'my.great.book.docx');
      expect(key).toBe('books/abc123/original.docx');
    });
  });

  describe('generateTranslationKey', () => {
    it('should generate correct translation key', () => {
      const key = s3Service.generateTranslationKey('book-1', 'tr-1', 5);
      expect(key).toBe('books/book-1/translations/tr-1/chapter-5.txt');
    });

    it('should handle chapter number 0', () => {
      const key = s3Service.generateTranslationKey('book-1', 'tr-1', 0);
      expect(key).toBe('books/book-1/translations/tr-1/chapter-0.txt');
    });
  });

  describe('generateAudioKey', () => {
    it('should generate correct audio key with default format', () => {
      const key = s3Service.generateAudioKey('book-1', 'ab-1', 3);
      expect(key).toBe('books/book-1/audio/ab-1/chapter-3.mp3');
    });

    it('should generate correct audio key with custom format', () => {
      const key = s3Service.generateAudioKey('book-1', 'ab-1', 1, 'm4a');
      expect(key).toBe('books/book-1/audio/ab-1/chapter-1.m4a');
    });
  });
});
