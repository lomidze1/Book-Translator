import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/epub+zip',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// Browsers (especially macOS) often report EPUB/DOCX as .zip or with generic MIME types
const GENERIC_MIME_TYPES = ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'];

const ALLOWED_EXTENSIONS = ['.pdf', '.epub', '.txt', '.docx', '.zip'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const MAGIC_BYTES: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  zip: [0x50, 0x4b, 0x03, 0x04], // PK (ZIP — covers EPUB and DOCX)
  epub: [0x50, 0x4b, 0x03, 0x04],
  docx: [0x50, 0x4b, 0x03, 0x04],
};

@Injectable()
export class FileValidationPipe implements PipeTransform {
  transform(file: Express.Multer.File): Express.Multer.File {
    if (!file) {
      throw new BadRequestException('ფაილი არ არის ატვირთული');
    }

    // Size check
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `ფაილი ზედმეტად დიდია (${(file.size / 1024 / 1024).toFixed(1)}MB). მაქსიმუმი: 50MB`,
      );
    }

    if (file.size === 0) {
      throw new BadRequestException('ფაილი ცარიელია');
    }

    // Extension check
    let ext = this.getExtension(file.originalname);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `ფაილის ტიპი "${ext}" არ არის მხარდაჭერილი. გამოიყენე: PDF, EPUB, TXT, DOCX`,
      );
    }

    // MIME type check — accept known + generic types, rely on magic bytes for security
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype) && !GENERIC_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('ფაილის MIME ტიპი არ არის მხარდაჭერილი');
    }

    // If extension is .zip, detect real type from content
    if (ext === '.zip' && file.buffer) {
      ext = this.detectZipContent(file.buffer);
      // Update originalname so downstream code gets the correct extension
      file.originalname = file.originalname.replace(/\.zip$/i, ext);
    }

    // Magic bytes check (for PDF, EPUB, DOCX)
    if (file.buffer && ext !== '.txt') {
      this.verifyMagicBytes(file.buffer, ext);
    }

    return file;
  }

  private getExtension(filename: string): string {
    return filename.substring(filename.lastIndexOf('.')).toLowerCase();
  }

  private detectZipContent(buffer: Buffer): string {
    // EPUB files contain a "mimetype" file as the first entry with content "application/epub+zip"
    // Check if the ZIP contains the EPUB signature
    const content = buffer.toString('ascii', 0, Math.min(buffer.length, 100));
    if (content.includes('mimetypeapplication/epub+zip')) {
      return '.epub';
    }

    // DOCX files contain [Content_Types].xml
    const contentStr = buffer.toString('ascii', 0, Math.min(buffer.length, 500));
    if (contentStr.includes('[Content_Types].xml') || contentStr.includes('word/')) {
      return '.docx';
    }

    // Default: treat as EPUB (most common case for book uploads)
    return '.epub';
  }

  private verifyMagicBytes(buffer: Buffer, ext: string): void {
    const type = ext.replace('.', '');
    const expected = MAGIC_BYTES[type];
    if (!expected) return;

    const actual = Array.from(buffer.subarray(0, expected.length));
    const matches = expected.every((byte, i) => actual[i] === byte);

    if (!matches) {
      throw new BadRequestException(
        'ფაილის შიგთავსი არ ემთხვევა მის ტიპს. შესაძლოა ფაილი დაზიანებულია.',
      );
    }
  }
}
