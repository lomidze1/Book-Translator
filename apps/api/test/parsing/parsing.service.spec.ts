import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ParsingService } from '../../src/parsing/parsing.service';

// Mock pdf-parse
vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}));

// Mock mammoth
vi.mock('mammoth', () => ({
  extractRawText: vi.fn(),
}));

describe('ParsingService', () => {
  let service: ParsingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ParsingService();
  });

  describe('parse', () => {
    it('should route PDF format to parsePdf', async () => {
      const pdfParse = (await import('pdf-parse')).default as any;
      pdfParse.mockResolvedValue({ text: 'Chapter 1\nSome content here.\nChapter 2\nMore content.' });

      const result = await service.parse(Buffer.from('fake-pdf'), 'PDF');
      expect(result.chapters.length).toBeGreaterThan(0);
      expect(result.totalWordCount).toBeGreaterThan(0);
    });

    it('should route DOCX format to parseDocx', async () => {
      const mammoth = await import('mammoth');
      (mammoth.extractRawText as any).mockResolvedValue({ value: 'Some document text with enough words to process.' });

      const result = await service.parse(Buffer.from('fake-docx'), 'DOCX');
      expect(result.chapters.length).toBeGreaterThan(0);
    });

    it('should route TXT format to parseTxt', async () => {
      const text = 'Chapter 1\nFirst chapter content goes here with several words.\nChapter 2\nSecond chapter content.';
      const result = await service.parse(Buffer.from(text), 'TXT');
      expect(result.chapters.length).toBe(2);
    });

    it('should throw BadRequestException for unsupported format', async () => {
      await expect(service.parse(Buffer.from('data'), 'UNKNOWN')).rejects.toThrow(BadRequestException);
    });

    it('should be case-insensitive for format', async () => {
      const text = 'Some text content for a book.';
      const result = await service.parse(Buffer.from(text), 'txt');
      expect(result.chapters.length).toBeGreaterThan(0);
    });
  });

  describe('parsePdf', () => {
    it('should throw if PDF has no extractable text', async () => {
      const pdfParse = (await import('pdf-parse')).default as any;
      pdfParse.mockResolvedValue({ text: '' });

      await expect(service.parse(Buffer.from('empty-pdf'), 'PDF')).rejects.toThrow('no extractable text');
    });

    it('should extract text and split into chapters', async () => {
      const pdfParse = (await import('pdf-parse')).default as any;
      pdfParse.mockResolvedValue({
        text: 'Chapter 1: Introduction\nThis is the first chapter with content.\nChapter 2: The Journey\nSecond chapter has more text.',
      });

      const result = await service.parse(Buffer.from('pdf-data'), 'PDF');
      expect(result.chapters.length).toBe(2);
      expect(result.chapters[0].number).toBe(1);
      expect(result.chapters[1].number).toBe(2);
    });
  });

  describe('parseDocx', () => {
    it('should throw if DOCX has no text', async () => {
      const mammoth = await import('mammoth');
      (mammoth.extractRawText as any).mockResolvedValue({ value: '' });

      await expect(service.parse(Buffer.from('empty'), 'DOCX')).rejects.toThrow('no extractable text');
    });
  });

  describe('parseTxt', () => {
    it('should throw for empty TXT', () => {
      expect(() => service.parse(Buffer.from(''), 'TXT')).rejects.toThrow('empty');
    });

    it('should handle whitespace-only TXT', () => {
      expect(() => service.parse(Buffer.from('   \n\n  '), 'TXT')).rejects.toThrow('empty');
    });
  });

  describe('splitIntoChapters', () => {
    it('should detect "Chapter N" pattern', () => {
      const text = 'Chapter 1\nFirst content here.\nChapter 2\nSecond content here.';
      const result = service.splitIntoChapters(text);
      expect(result.chapters.length).toBe(2);
      expect(result.chapters[0].number).toBe(1);
      expect(result.chapters[1].number).toBe(2);
    });

    it('should detect "CHAPTER N" pattern', () => {
      const text = 'CHAPTER 1\nContent one.\nCHAPTER 2\nContent two.';
      const result = service.splitIntoChapters(text);
      expect(result.chapters.length).toBe(2);
    });

    it('should detect Georgian "თავი N" pattern', () => {
      const text = 'თავი 1\nქართული ტექსტი.\nთავი 2\nმეორე თავის ტექსტი.';
      const result = service.splitIntoChapters(text);
      expect(result.chapters.length).toBe(2);
    });

    it('should fall back to word count splitting if no chapter markers', () => {
      const words = Array(12000).fill('word').join(' ');
      const result = service.splitIntoChapters(words);
      expect(result.chapters.length).toBe(3); // 12000 / 5000 = 2.4 → 3 chunks
    });

    it('should calculate correct total word count', () => {
      const text = 'Chapter 1\nOne two three.\nChapter 2\nFour five six seven.';
      const result = service.splitIntoChapters(text);
      expect(result.totalWordCount).toBeGreaterThan(0);
      expect(result.totalWordCount).toBe(
        result.chapters.reduce((sum, ch) => sum + ch.wordCount, 0),
      );
    });

    it('should extract chapter titles from first line', () => {
      const text = 'Chapter 1: The Beginning\nSome content.\nChapter 2: The Middle\nMore content.';
      const result = service.splitIntoChapters(text);
      expect(result.chapters[0].title).toContain('Chapter 1');
      expect(result.chapters[1].title).toContain('Chapter 2');
    });
  });
});
