import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/epub+zip',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.epub', '.txt', '.docx'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Magic bytes for file type verification
const EXTENSION_MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
  '.txt': 'text/plain',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const MAGIC_BYTES: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  epub: [0x50, 0x4b, 0x03, 0x04], // PK (ZIP)
  docx: [0x50, 0x4b, 0x03, 0x04], // PK (ZIP)
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
    const ext = this.getExtension(file.originalname);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `ფაილის ტიპი "${ext}" არ არის მხარდაჭერილი. გამოიყენე: PDF, EPUB, TXT, DOCX`,
      );
    }

    // MIME type check
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('ფაილის MIME ტიპი არ არის მხარდაჭერილი');
    }

    // MIME-to-extension cross-validation
    const expectedMime = EXTENSION_MIME_MAP[ext];
    if (expectedMime && file.mimetype !== expectedMime) {
      throw new BadRequestException(
        `ფაილის ტიპი და MIME არ ემთხვევა ერთმანეთს (${ext} ≠ ${file.mimetype})`,
      );
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
