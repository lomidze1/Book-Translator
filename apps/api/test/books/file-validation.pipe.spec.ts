import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { FileValidationPipe } from '../../src/books/upload/file-validation.pipe';

describe('FileValidationPipe', () => {
  const pipe = new FileValidationPipe();

  const createFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File => ({
    fieldname: 'file',
    originalname: 'test.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, ...Array(100).fill(0)]), // %PDF magic bytes
    stream: null as any,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  });

  // ========================
  // Valid files
  // ========================

  describe('valid files', () => {
    it('should accept valid PDF file', () => {
      const file = createFile();
      const result = pipe.transform(file);
      expect(result).toBe(file);
    });

    it('should accept valid EPUB file', () => {
      const file = createFile({
        originalname: 'book.epub',
        mimetype: 'application/epub+zip',
        buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array(100).fill(0)]), // PK magic bytes
      });
      const result = pipe.transform(file);
      expect(result).toBe(file);
    });

    it('should accept valid TXT file', () => {
      const file = createFile({
        originalname: 'book.txt',
        mimetype: 'text/plain',
        buffer: Buffer.from('Hello world content'),
      });
      const result = pipe.transform(file);
      expect(result).toBe(file);
    });

    it('should accept valid DOCX file', () => {
      const file = createFile({
        originalname: 'document.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array(100).fill(0)]), // PK magic bytes
      });
      const result = pipe.transform(file);
      expect(result).toBe(file);
    });
  });

  // ========================
  // Missing file
  // ========================

  describe('missing file', () => {
    it('should throw when no file provided', () => {
      expect(() => pipe.transform(null as any)).toThrow(BadRequestException);
      expect(() => pipe.transform(null as any)).toThrow('ფაილი არ არის ატვირთული');
    });

    it('should throw when undefined file provided', () => {
      expect(() => pipe.transform(undefined as any)).toThrow(BadRequestException);
    });
  });

  // ========================
  // File size
  // ========================

  describe('file size validation', () => {
    it('should throw when file exceeds 50MB', () => {
      const file = createFile({ size: 51 * 1024 * 1024 });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
      expect(() => pipe.transform(file)).toThrow('ზედმეტად დიდია');
    });

    it('should accept file exactly at 50MB', () => {
      const file = createFile({ size: 50 * 1024 * 1024 });
      const result = pipe.transform(file);
      expect(result).toBe(file);
    });

    it('should throw when file is empty (0 bytes)', () => {
      const file = createFile({ size: 0 });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
      expect(() => pipe.transform(file)).toThrow('ცარიელია');
    });
  });

  // ========================
  // Extension validation
  // ========================

  describe('extension validation', () => {
    it('should reject unsupported extension', () => {
      const file = createFile({
        originalname: 'image.jpg',
        mimetype: 'image/jpeg',
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
      expect(() => pipe.transform(file)).toThrow('არ არის მხარდაჭერილი');
    });

    it('should reject .exe files', () => {
      const file = createFile({
        originalname: 'malware.exe',
        mimetype: 'application/octet-stream',
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
    });

    it('should reject .zip files', () => {
      const file = createFile({
        originalname: 'archive.zip',
        mimetype: 'application/zip',
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
    });
  });

  // ========================
  // MIME type validation
  // ========================

  describe('MIME type validation', () => {
    it('should reject mismatched MIME type', () => {
      const file = createFile({
        originalname: 'test.pdf',
        mimetype: 'image/png',
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
      expect(() => pipe.transform(file)).toThrow('MIME');
    });

    it('should reject application/octet-stream for PDF', () => {
      const file = createFile({
        originalname: 'test.pdf',
        mimetype: 'application/octet-stream',
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
    });
  });

  // ========================
  // MIME-extension cross-validation
  // ========================

  describe('MIME-extension cross-validation', () => {
    it('should reject .txt file with application/pdf MIME', () => {
      const file = createFile({
        originalname: 'book.txt',
        mimetype: 'application/pdf',
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
      expect(() => pipe.transform(file)).toThrow('არ ემთხვევა');
    });

    it('should reject .pdf file with text/plain MIME', () => {
      const file = createFile({
        originalname: 'test.pdf',
        mimetype: 'text/plain',
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
    });

    it('should reject .epub file with DOCX MIME', () => {
      const file = createFile({
        originalname: 'book.epub',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array(100).fill(0)]),
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
    });
  });

  // ========================
  // Double extension attacks
  // ========================

  describe('double extension attacks', () => {
    it('should reject file with double extension ending in exe', () => {
      const file = createFile({
        originalname: 'payload.pdf.exe',
        mimetype: 'application/octet-stream',
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
    });

    it('should accept file with double extension ending in pdf', () => {
      const file = createFile({
        originalname: 'my.great.book.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, ...Array(100).fill(0)]),
      });
      const result = pipe.transform(file);
      expect(result).toBe(file);
    });
  });

  // ========================
  // Magic bytes verification
  // ========================

  describe('magic bytes verification', () => {
    it('should reject PDF with wrong magic bytes', () => {
      const file = createFile({
        originalname: 'fake.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from([0x00, 0x00, 0x00, 0x00, ...Array(100).fill(0)]),
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
      expect(() => pipe.transform(file)).toThrow('შიგთავსი არ ემთხვევა');
    });

    it('should reject EPUB with wrong magic bytes', () => {
      const file = createFile({
        originalname: 'fake.epub',
        mimetype: 'application/epub+zip',
        buffer: Buffer.from([0x00, 0x00, 0x00, 0x00, ...Array(100).fill(0)]),
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
    });

    it('should reject DOCX with wrong magic bytes', () => {
      const file = createFile({
        originalname: 'fake.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from([0xFF, 0xFE, 0x00, 0x00, ...Array(100).fill(0)]),
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
    });

    it('should skip magic bytes check for TXT files', () => {
      const file = createFile({
        originalname: 'book.txt',
        mimetype: 'text/plain',
        buffer: Buffer.from('Any content is fine for txt'),
      });
      const result = pipe.transform(file);
      expect(result).toBe(file);
    });
  });
});
