import { Injectable, BadRequestException } from '@nestjs/common';
import * as mammoth from 'mammoth';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

export interface ParsedChapter {
  number: number;
  title: string | null;
  content: string;
  wordCount: number;
}

export interface ParsedBook {
  chapters: ParsedChapter[];
  totalWordCount: number;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

@Injectable()
export class ParsingService {
  async parse(buffer: Buffer, format: string): Promise<ParsedBook> {
    if (buffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException('File size exceeds maximum limit (50MB)');
    }

    switch (format.toUpperCase()) {
      case 'PDF':
        return this.parsePdf(buffer);
      case 'EPUB':
        return this.parseEpub(buffer);
      case 'DOCX':
        return this.parseDocx(buffer);
      case 'TXT':
        return this.parseTxt(buffer);
      default:
        throw new BadRequestException(`Unsupported format: ${format}`);
    }
  }

  private async parsePdf(buffer: Buffer): Promise<ParsedBook> {
    // Switched from pdf-parse@1.1.1 (which bundled pdfjs v1.9.426–v2.0.550
    // from 2018) to unpdf, which wraps the maintained Mozilla pdfjs and
    // ships ESM-first. Dynamic import keeps Nest's CJS build happy.
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    // Per-page text (mergePages: false) so repeating headers/footers and page
    // numbers can be detected before the pages are stitched together.
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];

    const cleaned = this.cleanPdfPages(pages);

    if (!cleaned) {
      throw new BadRequestException('PDF file contains no extractable text');
    }

    return this.splitIntoChapters(cleaned);
  }

  /**
   * Clean per-page PDF text before it reaches the translator:
   * - strip running headers/footers (a first/last line repeating across pages)
   * - strip standalone page-number lines at page edges
   * - rejoin words hyphenated across line breaks ("beauti-\nful" → "beautiful")
   */
  private cleanPdfPages(pages: string[]): string {
    const pageLines = pages.map((page) => page.split('\n').map((line) => line.trim()));

    // Page numbers inside a header vary per page — ignore digits when
    // deciding whether a line repeats.
    const normalize = (line: string) =>
      line.replace(/\d+/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

    const isPageNumber = (line: string) =>
      /^[-–—\s]*(?:page\s+)?\d{1,4}(?:\s*(?:\/|of)\s*\d{1,4})?[-–—\s]*$/i.test(line);

    // Count how often each normalized line opens/closes a page.
    const firstCounts = new Map<string, number>();
    const lastCounts = new Map<string, number>();
    for (const lines of pageLines) {
      const nonEmpty = lines.filter((l) => l);
      if (nonEmpty.length === 0) continue;
      const first = normalize(nonEmpty[0]);
      const last = normalize(nonEmpty[nonEmpty.length - 1]);
      if (first) firstCounts.set(first, (firstCounts.get(first) || 0) + 1);
      if (last) lastCounts.set(last, (lastCounts.get(last) || 0) + 1);
    }

    const threshold = Math.max(2, Math.ceil(pageLines.length * 0.6));
    const repeats = (counts: Map<string, number>, line: string) =>
      pageLines.length >= 3 && (counts.get(normalize(line)) || 0) >= threshold;

    const cleanedPages = pageLines.map((lines) => {
      const kept = lines.filter((l) => l);
      // Strip up to two matching lines from each edge (header + page number
      // can stack), never touching lines in the middle of the page.
      for (let pass = 0; pass < 2; pass++) {
        if (kept.length && (isPageNumber(kept[0]) || repeats(firstCounts, kept[0]))) kept.shift();
        if (kept.length && (isPageNumber(kept[kept.length - 1]) || repeats(lastCounts, kept[kept.length - 1]))) kept.pop();
      }
      return kept.join('\n');
    });

    return cleanedPages
      .filter((p) => p)
      .join('\n')
      // Line-break hyphenation: lowercase continuation means a split word;
      // an uppercase continuation is a real hyphen (Anna-Maria) — keep it,
      // drop only the line break.
      .replace(/([A-Za-z])-\n([a-z])/g, '$1$2')
      .replace(/([A-Za-z])-\n([A-Z])/g, '$1-$2')
      .trim();
  }

  private async parseEpub(buffer: Buffer): Promise<ParsedBook> {
    const epub2Module = await import('epub2');
    const EPub = (epub2Module as any).default || epub2Module;

    // Use secure random filename in temp directory
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epub-'));
    const tmpFile = path.join(tmpDir, `${crypto.randomUUID()}.epub`);

    fs.writeFileSync(tmpFile, buffer);

    try {
      return await new Promise<ParsedBook>((resolve, reject) => {
        const epub = new EPub(tmpFile);

        epub.on('end', async () => {
          try {
            const chapters: ParsedChapter[] = [];
            let chapterNum = 0;

            // Flow items often lack titles — fall back to the TOC, matching
            // by id or by href (ignoring the #fragment part).
            const tocTitles = new Map<string, string>();
            for (const entry of epub.toc || []) {
              if (!entry?.title) continue;
              if (entry.id) tocTitles.set(String(entry.id), entry.title);
              if (entry.href) tocTitles.set(String(entry.href).split('#')[0], entry.title);
            }

            for (const item of epub.flow) {
              try {
                const chapterId = item.id as string;
                if (!chapterId) continue;
                const text = await new Promise<string>((res, rej) => {
                  epub.getChapter(chapterId, (err: Error, data?: string) => {
                    if (err) rej(err);
                    else res(data || '');
                  });
                });

                const plainText = this.htmlToPlainText(text);
                if (plainText.length < 50) continue;

                chapterNum++;
                const hrefKey = item.href ? String(item.href).split('#')[0] : '';
                chapters.push({
                  number: chapterNum,
                  title: item.title || tocTitles.get(chapterId) || (hrefKey && tocTitles.get(hrefKey)) || null,
                  content: plainText,
                  wordCount: plainText.split(/\s+/).length,
                });
              } catch {
                // Skip unreadable chapters
              }
            }

            if (chapters.length === 0) {
              reject(new BadRequestException('EPUB file contains no extractable chapters'));
              return;
            }

            resolve({
              chapters,
              totalWordCount: chapters.reduce((sum, ch) => sum + ch.wordCount, 0),
            });
          } catch (err) {
            reject(err);
          }
        });

        epub.on('error', (err: Error) => {
          reject(new BadRequestException(`Failed to parse EPUB: ${err.message}`));
        });

        epub.parse();
      });
    } finally {
      // Always clean up temp file
      try {
        fs.unlinkSync(tmpFile);
        fs.rmdirSync(tmpDir);
      } catch { /* ignore cleanup errors */ }
    }
  }

  /**
   * Convert chapter HTML to plain text while preserving paragraph structure.
   * Block-level tag boundaries become newlines (the chunker and the translation
   * prompt both rely on newlines to keep paragraphs intact); inline tags are
   * stripped without breaking the line.
   */
  private htmlToPlainText(html: string): string {
    return (
      html
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        // Closing (or self-closing) block-level tags end a paragraph
        .replace(/<\/(p|div|h[1-6]|li|blockquote|section|article|header|footer|figure|figcaption|table|tr|ul|ol|dl|dd|dt|pre|aside|hr)\s*>/gi, '\n\n')
        .replace(/<hr[^>]*\/?>/gi, '\n\n')
        .replace(/<[^>]*>/g, ' ')
        // Decode the entities that actually occur in book markup
        .replace(/&nbsp;/gi, ' ')
        .replace(/&mdash;/gi, '—')
        .replace(/&ndash;/gi, '–')
        .replace(/&hellip;/gi, '…')
        .replace(/&(ldquo|rdquo|quot);/gi, '"')
        .replace(/&(lsquo|rsquo|apos|#39);/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&amp;/gi, '&')
        // Collapse horizontal whitespace, keep line structure
        .replace(/[^\S\n]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    );
  }

  private async parseDocx(buffer: Buffer): Promise<ParsedBook> {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();

    if (!text) {
      throw new BadRequestException('DOCX file contains no extractable text');
    }

    return this.splitIntoChapters(text);
  }

  private parseTxt(buffer: Buffer): ParsedBook {
    const text = buffer.toString('utf-8').trim();

    if (!text) {
      throw new BadRequestException('TXT file is empty');
    }

    return this.splitIntoChapters(text);
  }

  /**
   * Split text into chapters by common patterns:
   * - "Chapter N" / "Part N" (arabic, Roman, or spelled-out numbers), "თავი N"
   * - "Prologue" / "Epilogue" headings (with an optional subtitle)
   * - standalone Roman numeral headings on their own line ("I.", "IV")
   * Falls back to splitting by ~5000 words if no chapter markers found.
   */
  splitIntoChapters(text: string): ParsedBook {
    const markerIndices = this.findChapterMarkers(text);

    let chapters: ParsedChapter[];

    if (markerIndices.length >= 2) {
      chapters = [];
      for (let i = 0; i < markerIndices.length; i++) {
        const start = markerIndices[i];
        const end = i + 1 < markerIndices.length ? markerIndices[i + 1] : text.length;
        const content = text.slice(start, end).trim();

        // Extract title from first line
        const firstLine = content.split('\n')[0].trim();

        chapters.push({
          number: i + 1,
          title: firstLine || null,
          content,
          wordCount: content.split(/\s+/).length,
        });
      }
    } else {
      // No chapter markers — split by word count (~5000 words per chunk)
      chapters = this.splitByWordCount(text, 5000);
    }

    return {
      chapters,
      totalWordCount: chapters.reduce((sum, ch) => sum + ch.wordCount, 0),
    };
  }

  /**
   * Start offsets of every recognized chapter heading, sorted and deduped.
   * A bare "I" line is deliberately not a marker (pronoun/poetry) — a
   * standalone Roman heading needs either a trailing dot or 2+ numerals.
   */
  private findChapterMarkers(text: string): number[] {
    const spelled =
      'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty';
    const patterns = [
      new RegExp(`(?:^|\\n)(?:chapter|part|თავი)\\s+(?:\\d+|[ivxlcdm]+|${spelled})\\b[.:)?\\s-]*`, 'gi'),
      // Prologue / Epilogue alone on a line, optionally with a short subtitle
      /(?:^|\n)[ \t]*(?:prologue|epilogue)\b(?:[ \t.:—-][^\n]{0,60})?(?=\n|$)/gi,
      // Standalone Roman numeral heading on its own line
      /(?:^|\n)[ \t]*(?:[IVXLCDM]{2,7}|[IVXLCDM]\.)\.?[ \t]*(?=\n|$)/g,
    ];

    const indices = new Set<number>();
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        indices.add(match.index! + (match[0].startsWith('\n') ? 1 : 0));
      }
    }
    return [...indices].sort((a, b) => a - b);
  }

  private splitByWordCount(text: string, wordsPerChapter: number): ParsedChapter[] {
    // Accumulate whole paragraphs (units keep their trailing newlines) so the
    // source structure survives — mirrors ClaudeService.splitIntoChunks.
    // Joining a flat word list with spaces here used to erase every paragraph
    // break for any book without chapter markers.
    const parts = text.split(/(\n+)/);
    const units: string[] = [];
    for (let i = 0; i < parts.length; i += 2) {
      const unit = parts[i] + (parts[i + 1] || '');
      if (unit) units.push(unit);
    }

    const contents: string[] = [];
    let current = '';
    let currentWords = 0;

    const flush = () => {
      if (current.trim()) contents.push(current.replace(/\s+$/, ''));
      current = '';
      currentWords = 0;
    };

    for (const unit of units) {
      const trimmed = unit.trim();
      const unitWords = trimmed ? trimmed.split(/\s+/).length : 0;
      if (unitWords > wordsPerChapter) {
        // Single paragraph bigger than a whole chapter (e.g. text with no
        // line breaks at all) — fall back to plain word slicing within it.
        flush();
        const words = trimmed.split(/\s+/);
        for (let i = 0; i < words.length; i += wordsPerChapter) {
          contents.push(words.slice(i, i + wordsPerChapter).join(' '));
        }
        continue;
      }
      if (currentWords + unitWords > wordsPerChapter) flush();
      current += unit;
      currentWords += unitWords;
    }
    flush();

    return contents.map((content, i) => ({
      number: i + 1,
      title: null,
      content,
      wordCount: content.split(/\s+/).length,
    }));
  }
}
