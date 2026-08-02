import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ParsingService } from '../../src/parsing/parsing.service';

// Mock unpdf (replaces the legacy pdf-parse import). The service calls
// getDocumentProxy(buffer) then extractText(pdf, { mergePages: true }).
vi.mock('unpdf', () => ({
  getDocumentProxy: vi.fn().mockResolvedValue({}),
  extractText: vi.fn(),
}));

// Mock mammoth
vi.mock('mammoth', () => ({
  extractRawText: vi.fn(),
}));

// Mock epub2
vi.mock('epub2', () => {
  const EventEmitter = require('events');
  class MockEPub extends EventEmitter {
    flow: any[] = [];
    constructor() {
      super();
    }
    parse() {
      // Trigger 'end' async
      setTimeout(() => this.emit('end'), 0);
    }
    getChapter(id: string, cb: (err: Error | null, data?: string) => void) {
      cb(null, `<p>Chapter content for ${id}</p>`);
    }
  }
  return { default: MockEPub };
});

// Mock fs, os, path, crypto for EPUB temp file handling
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    mkdtempSync: vi.fn().mockReturnValue('/tmp/epub-test'),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    rmdirSync: vi.fn(),
  };
});

vi.mock('crypto', async () => {
  const actual = await vi.importActual('crypto');
  return {
    ...actual,
    randomUUID: vi.fn().mockReturnValue('test-uuid-1234'),
  };
});

describe('ParsingService', () => {
  let service: ParsingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ParsingService();
  });

  describe('parse', () => {
    it('should route PDF format to parsePdf', async () => {
      const { extractText } = (await import('unpdf')) as unknown as { extractText: ReturnType<typeof vi.fn> };
      extractText.mockResolvedValue({ text: 'Chapter 1\nSome content here.\nChapter 2\nMore content.', totalPages: 2 });

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

    it('should throw if file exceeds 50MB limit', async () => {
      const largeBuffer = Buffer.alloc(51 * 1024 * 1024); // 51MB
      await expect(service.parse(largeBuffer, 'TXT')).rejects.toThrow('maximum limit');
    });
  });

  describe('parsePdf', () => {
    it('should throw if PDF has no extractable text', async () => {
      const { extractText } = (await import('unpdf')) as unknown as { extractText: ReturnType<typeof vi.fn> };
      extractText.mockResolvedValue({ text: '', totalPages: 0 });

      await expect(service.parse(Buffer.from('empty-pdf'), 'PDF')).rejects.toThrow('no extractable text');
    });

    it('should extract text and split into chapters', async () => {
      const { extractText } = (await import('unpdf')) as unknown as { extractText: ReturnType<typeof vi.fn> };
      extractText.mockResolvedValue({
        text: 'Chapter 1: Introduction\nThis is the first chapter with content.\nChapter 2: The Journey\nSecond chapter has more text.',
        totalPages: 2,
      });

      const result = await service.parse(Buffer.from('pdf-data'), 'PDF');
      expect(result.chapters.length).toBe(2);
      expect(result.chapters[0].number).toBe(1);
      expect(result.chapters[1].number).toBe(2);
    });

    it('should strip repeating headers and footer page numbers across pages', async () => {
      const { extractText } = (await import('unpdf')) as unknown as { extractText: ReturnType<typeof vi.fn> };
      const makePage = (n: number, body: string) => `MOBY DICK\n${body}\n${n}`;
      extractText.mockResolvedValue({
        text: [
          makePage(10, 'Chapter 1\nCall me Ishmael. Some years ago I went to sea.'),
          makePage(11, 'The ship sailed on through heavy weather that night.'),
          makePage(12, 'Chapter 2\nThe crew gathered on the deck at dawn quietly.'),
          makePage(13, 'They spoke of whales and distant seas for hours.'),
        ],
        totalPages: 4,
      });

      const result = await service.parse(Buffer.from('pdf-data'), 'PDF');
      const allContent = result.chapters.map((c) => c.content).join('\n');

      expect(allContent).not.toContain('MOBY DICK');
      expect(allContent).not.toMatch(/^\s*1[0-3]\s*$/m); // no standalone page numbers
      expect(allContent).toContain('Call me Ishmael');
      expect(allContent).toContain('whales and distant seas');
      expect(result.chapters.length).toBe(2); // chapter detection still works
    });

    it('should not strip non-repeating first lines (real content)', async () => {
      const { extractText } = (await import('unpdf')) as unknown as { extractText: ReturnType<typeof vi.fn> };
      extractText.mockResolvedValue({
        text: [
          'Once upon a time there was a small village by the sea.',
          'The villagers fished every morning before the sun rose.',
          'One day a stranger arrived carrying a mysterious box.',
        ],
        totalPages: 3,
      });

      const result = await service.parse(Buffer.from('pdf-data'), 'PDF');
      const allContent = result.chapters.map((c) => c.content).join('\n');

      expect(allContent).toContain('Once upon a time');
      expect(allContent).toContain('villagers fished');
      expect(allContent).toContain('mysterious box');
    });

    it('should rejoin words hyphenated across line breaks', async () => {
      const { extractText } = (await import('unpdf')) as unknown as { extractText: ReturnType<typeof vi.fn> };
      extractText.mockResolvedValue({
        text: ['The sunset was beauti-\nful that evening and every-\none stopped to watch it fade.'],
        totalPages: 1,
      });

      const result = await service.parse(Buffer.from('pdf-data'), 'PDF');
      const content = result.chapters[0].content;

      expect(content).toContain('beautiful');
      expect(content).toContain('everyone');
      expect(content).not.toContain('beauti-');
    });

    it('should keep hyphens before capitalized words (proper names)', async () => {
      const { extractText } = (await import('unpdf')) as unknown as { extractText: ReturnType<typeof vi.fn> };
      extractText.mockResolvedValue({
        text: ['She greeted Anna-\nMaria warmly at the station before the train arrived that afternoon.'],
        totalPages: 1,
      });

      const result = await service.parse(Buffer.from('pdf-data'), 'PDF');
      const content = result.chapters[0].content;

      // Proper-name hyphen must not be silently merged into "AnnaMaria"
      expect(content).not.toContain('AnnaMaria');
      expect(content).toContain('Anna-Maria');
    });

    it('should keep digit-only lines that are not at page edges', async () => {
      const { extractText } = (await import('unpdf')) as unknown as { extractText: ReturnType<typeof vi.fn> };
      extractText.mockResolvedValue({
        text: ['The code to the vault was simple.\n1234\nNobody ever guessed it though they tried for years.'],
        totalPages: 1,
      });

      const result = await service.parse(Buffer.from('pdf-data'), 'PDF');
      const content = result.chapters[0].content;

      expect(content).toContain('1234');
    });

    it('should throw if unpdf throws (corrupt PDF)', async () => {
      const { extractText } = (await import('unpdf')) as unknown as { extractText: ReturnType<typeof vi.fn> };
      extractText.mockRejectedValue(new Error('Invalid PDF structure'));

      await expect(service.parse(Buffer.from('corrupt'), 'PDF')).rejects.toThrow('Invalid PDF structure');
    });

    it('should accept page-array text from unpdf (mergePages safety net)', async () => {
      // unpdf can return text as string (mergePages: true) or string[] (false).
      // We always pass mergePages: true, but defend against an array result too.
      const { extractText } = (await import('unpdf')) as unknown as { extractText: ReturnType<typeof vi.fn> };
      extractText.mockResolvedValue({
        text: ['Chapter 1\nPage one content.', 'Chapter 2\nPage two content.'],
        totalPages: 2,
      });

      const result = await service.parse(Buffer.from('pdf-data'), 'PDF');
      expect(result.chapters.length).toBeGreaterThan(0);
    });
  });

  describe('parseEpub', () => {
    it('should parse EPUB and extract chapters from flow', async () => {
      const epub2Module = await import('epub2');
      const MockEPub = (epub2Module as any).default;

      // Override the mock to have chapters in flow
      const origParse = MockEPub.prototype.parse;
      MockEPub.prototype.parse = function () {
        this.flow = [
          { id: 'ch1', title: 'Chapter 1' },
          { id: 'ch2', title: 'Chapter 2' },
        ];
        setTimeout(() => this.emit('end'), 0);
      };

      // Override getChapter to return enough content (> 50 chars)
      MockEPub.prototype.getChapter = function (id: string, cb: any) {
        cb(null, `<p>This is a long enough chapter content for ${id} that exceeds the minimum character limit of fifty characters easily.</p>`);
      };

      const result = await service.parse(Buffer.from('fake-epub'), 'EPUB');
      expect(result.chapters.length).toBe(2);
      expect(result.chapters[0].title).toBe('Chapter 1');
      expect(result.chapters[1].title).toBe('Chapter 2');
      expect(result.totalWordCount).toBeGreaterThan(0);

      // Restore
      MockEPub.prototype.parse = origParse;
    });

    it('should skip chapters shorter than 50 characters', async () => {
      const epub2Module = await import('epub2');
      const MockEPub = (epub2Module as any).default;

      MockEPub.prototype.parse = function () {
        this.flow = [
          { id: 'toc', title: 'TOC' },
          { id: 'ch1', title: 'Chapter 1' },
        ];
        setTimeout(() => this.emit('end'), 0);
      };

      MockEPub.prototype.getChapter = function (id: string, cb: any) {
        if (id === 'toc') {
          cb(null, '<p>Short</p>'); // < 50 chars, should be skipped
        } else {
          cb(null, `<p>This is a long enough chapter content for ${id} that exceeds the minimum character limit of fifty characters and has real content.</p>`);
        }
      };

      const result = await service.parse(Buffer.from('fake-epub'), 'EPUB');
      expect(result.chapters.length).toBe(1);
      expect(result.chapters[0].title).toBe('Chapter 1');
    });

    it('should strip HTML tags from EPUB content', async () => {
      const epub2Module = await import('epub2');
      const MockEPub = (epub2Module as any).default;

      MockEPub.prototype.parse = function () {
        this.flow = [{ id: 'ch1', title: 'Test' }];
        setTimeout(() => this.emit('end'), 0);
      };

      MockEPub.prototype.getChapter = function (_id: string, cb: any) {
        cb(null, '<h1>Title</h1><p>This is <strong>bold</strong> and <em>italic</em> content that is long enough to pass the minimum threshold easily.</p>');
      };

      const result = await service.parse(Buffer.from('fake-epub'), 'EPUB');
      const content = result.chapters[0].content;
      expect(content).not.toContain('<');
      expect(content).not.toContain('>');
      expect(content).toContain('bold');
      expect(content).toContain('italic');
    });

    it('should preserve paragraph breaks from block-level HTML tags', async () => {
      const epub2Module = await import('epub2');
      const MockEPub = (epub2Module as any).default;

      MockEPub.prototype.parse = function () {
        this.flow = [{ id: 'ch1', title: 'Test' }];
        setTimeout(() => this.emit('end'), 0);
      };

      MockEPub.prototype.getChapter = function (_id: string, cb: any) {
        cb(
          null,
          '<h1>Chapter One</h1>' +
            '<p>First paragraph with enough words to matter for the test threshold.</p>' +
            '<p>Second paragraph continues the story with more words here.</p>' +
            '<p>Third paragraph ends the sample text for this chapter.</p>',
        );
      };

      const result = await service.parse(Buffer.from('fake-epub'), 'EPUB');
      const content = result.chapters[0].content;

      // Paragraph structure must survive: block boundaries become newlines
      expect(content).toContain('\n');
      const paragraphs = content.split(/\n+/).filter((p) => p.trim());
      expect(paragraphs.length).toBe(4); // heading + 3 paragraphs
      expect(paragraphs[0]).toBe('Chapter One');
      expect(paragraphs[1]).toContain('First paragraph');
      expect(paragraphs[2]).toContain('Second paragraph');
      expect(paragraphs[3]).toContain('Third paragraph');
    });

    it('should not break paragraphs at inline tags', async () => {
      const epub2Module = await import('epub2');
      const MockEPub = (epub2Module as any).default;

      MockEPub.prototype.parse = function () {
        this.flow = [{ id: 'ch1', title: 'Test' }];
        setTimeout(() => this.emit('end'), 0);
      };

      MockEPub.prototype.getChapter = function (_id: string, cb: any) {
        cb(
          null,
          '<p>One paragraph with <strong>bold</strong>, <em>italic</em> and <a href="#x">a link</a> that must stay on a single line despite inline markup.</p>',
        );
      };

      const result = await service.parse(Buffer.from('fake-epub'), 'EPUB');
      const content = result.chapters[0].content;
      expect(content).not.toContain('\n');
      expect(content).toContain('bold');
      expect(content).toContain('italic');
      expect(content).toContain('a link');
    });

    it('should convert <br> to a line break', async () => {
      const epub2Module = await import('epub2');
      const MockEPub = (epub2Module as any).default;

      MockEPub.prototype.parse = function () {
        this.flow = [{ id: 'ch1', title: 'Test' }];
        setTimeout(() => this.emit('end'), 0);
      };

      MockEPub.prototype.getChapter = function (_id: string, cb: any) {
        cb(null, '<p>First line of a poem stanza here<br/>Second line follows right after it<br>Third line completes the stanza sample.</p>');
      };

      const result = await service.parse(Buffer.from('fake-epub'), 'EPUB');
      const lines = result.chapters[0].content.split('\n').filter((l) => l.trim());
      expect(lines.length).toBe(3);
      expect(lines[0]).toContain('First line');
      expect(lines[2]).toContain('Third line');
    });

    it('should decode common HTML entities', async () => {
      const epub2Module = await import('epub2');
      const MockEPub = (epub2Module as any).default;

      MockEPub.prototype.parse = function () {
        this.flow = [{ id: 'ch1', title: 'Test' }];
        setTimeout(() => this.emit('end'), 0);
      };

      MockEPub.prototype.getChapter = function (_id: string, cb: any) {
        cb(
          null,
          '<p>Tom &amp; Jerry said &quot;hello&quot; &mdash; it&#39;s a &lt;test&gt; of entities with enough length to pass the threshold.</p>',
        );
      };

      const result = await service.parse(Buffer.from('fake-epub'), 'EPUB');
      const content = result.chapters[0].content;
      expect(content).toContain('Tom & Jerry');
      expect(content).toContain('"hello"');
      expect(content).toContain("it's");
      expect(content).toContain('<test>');
      expect(content).not.toContain('&amp;');
      expect(content).not.toContain('&quot;');
    });

    it('should drop script and style contents entirely', async () => {
      const epub2Module = await import('epub2');
      const MockEPub = (epub2Module as any).default;

      MockEPub.prototype.parse = function () {
        this.flow = [{ id: 'ch1', title: 'Test' }];
        setTimeout(() => this.emit('end'), 0);
      };

      MockEPub.prototype.getChapter = function (_id: string, cb: any) {
        cb(
          null,
          '<style>p { color: red; }</style><script>var x = 1;</script>' +
            '<p>Actual chapter text that should survive the cleanup and is long enough for the threshold.</p>',
        );
      };

      const result = await service.parse(Buffer.from('fake-epub'), 'EPUB');
      const content = result.chapters[0].content;
      expect(content).not.toContain('color: red');
      expect(content).not.toContain('var x = 1');
      expect(content).toContain('Actual chapter text');
    });

    it('should collapse runs of blank lines to a single paragraph break', async () => {
      const epub2Module = await import('epub2');
      const MockEPub = (epub2Module as any).default;

      MockEPub.prototype.parse = function () {
        this.flow = [{ id: 'ch1', title: 'Test' }];
        setTimeout(() => this.emit('end'), 0);
      };

      MockEPub.prototype.getChapter = function (_id: string, cb: any) {
        cb(
          null,
          '<div><div><p>First paragraph with plenty of words to pass the fifty character rule.</p></div></div>' +
            '\n\n\n<p>Second paragraph after nested divs and stray whitespace in the markup.</p>',
        );
      };

      const result = await service.parse(Buffer.from('fake-epub'), 'EPUB');
      const content = result.chapters[0].content;
      expect(content).not.toMatch(/\n{3,}/);
      const paragraphs = content.split(/\n+/).filter((p) => p.trim());
      expect(paragraphs.length).toBe(2);
    });

    it('should throw if EPUB has no extractable chapters', async () => {
      const epub2Module = await import('epub2');
      const MockEPub = (epub2Module as any).default;

      MockEPub.prototype.parse = function () {
        this.flow = []; // Empty flow
        setTimeout(() => this.emit('end'), 0);
      };

      await expect(service.parse(Buffer.from('empty-epub'), 'EPUB')).rejects.toThrow('no extractable chapters');
    });

    it('should handle EPUB parse error', async () => {
      const epub2Module = await import('epub2');
      const MockEPub = (epub2Module as any).default;

      MockEPub.prototype.parse = function () {
        setTimeout(() => this.emit('error', new Error('Corrupt EPUB file')), 0);
      };

      await expect(service.parse(Buffer.from('corrupt-epub'), 'EPUB')).rejects.toThrow('Failed to parse EPUB');
    });

    it('should skip chapters with no id', async () => {
      const epub2Module = await import('epub2');
      const MockEPub = (epub2Module as any).default;

      MockEPub.prototype.parse = function () {
        this.flow = [
          { title: 'No ID chapter' }, // no id field
          { id: 'ch1', title: 'Valid Chapter' },
        ];
        setTimeout(() => this.emit('end'), 0);
      };

      MockEPub.prototype.getChapter = function (_id: string, cb: any) {
        cb(null, '<p>This is a long enough chapter content that exceeds the minimum character limit of fifty characters easily for testing purposes.</p>');
      };

      const result = await service.parse(Buffer.from('fake-epub'), 'EPUB');
      expect(result.chapters.length).toBe(1);
    });

    it('should handle getChapter errors gracefully (skip chapter)', async () => {
      const epub2Module = await import('epub2');
      const MockEPub = (epub2Module as any).default;

      MockEPub.prototype.parse = function () {
        this.flow = [
          { id: 'bad-ch', title: 'Bad Chapter' },
          { id: 'good-ch', title: 'Good Chapter' },
        ];
        setTimeout(() => this.emit('end'), 0);
      };

      MockEPub.prototype.getChapter = function (id: string, cb: any) {
        if (id === 'bad-ch') {
          cb(new Error('Cannot read chapter'));
        } else {
          cb(null, '<p>This is a long enough chapter content that exceeds the minimum character limit of fifty characters easily for testing.</p>');
        }
      };

      const result = await service.parse(Buffer.from('fake-epub'), 'EPUB');
      expect(result.chapters.length).toBe(1);
      expect(result.chapters[0].title).toBe('Good Chapter');
    });

    it('should create temp file with secure random name', async () => {
      const fs = await import('fs');
      const epub2Module = await import('epub2');
      const MockEPub = (epub2Module as any).default;

      MockEPub.prototype.parse = function () {
        this.flow = [{ id: 'ch1', title: 'Ch 1' }];
        setTimeout(() => this.emit('end'), 0);
      };

      MockEPub.prototype.getChapter = function (_id: string, cb: any) {
        cb(null, '<p>Long enough content for the chapter that exceeds minimum threshold of fifty characters for testing purposes in this test.</p>');
      };

      await service.parse(Buffer.from('fake-epub'), 'EPUB');

      expect(fs.mkdtempSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
      // Cleanup should happen
      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(fs.rmdirSync).toHaveBeenCalled();
    });
  });

  describe('parseDocx', () => {
    it('should throw if DOCX has no text', async () => {
      const mammoth = await import('mammoth');
      (mammoth.extractRawText as any).mockResolvedValue({ value: '' });

      await expect(service.parse(Buffer.from('empty'), 'DOCX')).rejects.toThrow('no extractable text');
    });

    it('should throw if mammoth throws (corrupt DOCX)', async () => {
      const mammoth = await import('mammoth');
      (mammoth.extractRawText as any).mockRejectedValue(new Error('Cannot read DOCX'));

      await expect(service.parse(Buffer.from('corrupt'), 'DOCX')).rejects.toThrow('Cannot read DOCX');
    });
  });

  describe('parseTxt', () => {
    it('should throw for empty TXT', async () => {
      await expect(service.parse(Buffer.from(''), 'TXT')).rejects.toThrow('empty');
    });

    it('should handle whitespace-only TXT', async () => {
      await expect(service.parse(Buffer.from('   \n\n  '), 'TXT')).rejects.toThrow('empty');
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

    it('should detect "Part N" / "PART N" pattern', () => {
      const text = 'Part 1\nFirst part content here.\nPart 2\nSecond part content here.';
      const result = service.splitIntoChapters(text);
      expect(result.chapters.length).toBe(2);
    });

    it('should detect Roman numeral chapter markers', () => {
      const text = 'Chapter I\nFirst chapter content.\nChapter II\nSecond chapter content.';
      const result = service.splitIntoChapters(text);
      expect(result.chapters.length).toBe(2);
    });

    it('should fall back to word count splitting if no chapter markers', () => {
      const words = Array(12000).fill('word').join(' ');
      const result = service.splitIntoChapters(words);
      expect(result.chapters.length).toBe(3); // 12000 / 5000 = 2.4 → 3 chunks
    });

    it('should fall back to word count if only 1 chapter marker (needs >= 2)', () => {
      const text = 'Chapter 1\nThis is the only chapter with a lot of content but no second marker.';
      const result = service.splitIntoChapters(text);
      // Only 1 match, so fallback to word count splitting
      // Short text = 1 chunk
      expect(result.chapters.length).toBe(1);
      expect(result.chapters[0].title).toBeNull(); // word-count chunks have no title
    });

    it('should preserve paragraph breaks in word-count fallback', () => {
      // No chapter markers → word-count split. Paragraph structure must survive.
      const text =
        'First paragraph has a handful of words in it.\n\n' +
        'Second paragraph continues with a few more words.\n\n' +
        'Third paragraph closes out the short sample text.';
      const result = service.splitIntoChapters(text);

      expect(result.chapters.length).toBe(1);
      const content = result.chapters[0].content;
      const paragraphs = content.split(/\n+/).filter((p) => p.trim());
      expect(paragraphs.length).toBe(3);
      expect(paragraphs[0]).toContain('First paragraph');
      expect(paragraphs[2]).toContain('Third paragraph');
    });

    it('should split word-count fallback chapters at paragraph boundaries', () => {
      // 120 paragraphs x 100 words = 12000 words → 3 chapters (5000 word budget).
      const paragraph = Array(100).fill('word').join(' ');
      const text = Array(120).fill(paragraph).join('\n\n');
      const result = service.splitIntoChapters(text);

      expect(result.chapters.length).toBe(3);
      for (const chapter of result.chapters) {
        // No chapter may exceed the word budget
        expect(chapter.wordCount).toBeLessThanOrEqual(5000);
        // Paragraph structure survives inside each chapter
        expect(chapter.content).toContain('\n');
        // Every paragraph is intact — never cut mid-paragraph across a boundary
        const paragraphs = chapter.content.split(/\n+/).filter((p) => p.trim());
        for (const p of paragraphs) {
          expect(p.split(/\s+/).length).toBe(100);
        }
      }
      // All 120 paragraphs survive the round trip
      const totalParagraphs = result.chapters
        .flatMap((ch) => ch.content.split(/\n+/))
        .filter((p) => p.trim()).length;
      expect(totalParagraphs).toBe(120);
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
