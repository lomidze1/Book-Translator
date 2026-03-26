import { Injectable, BadRequestException } from '@nestjs/common';
import pdfParseModule from 'pdf-parse';
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
    const data = await pdfParseModule(buffer);
    const text = data.text.trim();

    if (!text) {
      throw new BadRequestException('PDF file contains no extractable text');
    }

    return this.splitIntoChapters(text);
  }

  private async parseEpub(buffer: Buffer): Promise<ParsedBook> {
    const EPub = (await import('epub2')).default;

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

                // Strip HTML tags
                const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                if (plainText.length < 50) continue;

                chapterNum++;
                chapters.push({
                  number: chapterNum,
                  title: item.title || null,
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
   * - "Chapter N", "CHAPTER N", "Part N"
   * - "თავი N" (Georgian)
   * Falls back to splitting by ~5000 words if no chapter markers found.
   */
  splitIntoChapters(text: string): ParsedBook {
    const chapterPattern = /(?:^|\n)(?:chapter|CHAPTER|Chapter|Part|PART|თავი)\s+(\d+|[IVXLCDM]+)[.:)?\s-]*/gm;
    const matches = [...text.matchAll(chapterPattern)];

    let chapters: ParsedChapter[];

    if (matches.length >= 2) {
      chapters = [];
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index!;
        const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
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

  private splitByWordCount(text: string, wordsPerChapter: number): ParsedChapter[] {
    const words = text.split(/\s+/);
    const chapters: ParsedChapter[] = [];
    let chapterNum = 0;

    for (let i = 0; i < words.length; i += wordsPerChapter) {
      chapterNum++;
      const chunkWords = words.slice(i, i + wordsPerChapter);
      const content = chunkWords.join(' ');

      chapters.push({
        number: chapterNum,
        title: null,
        content,
        wordCount: chunkWords.length,
      });
    }

    return chapters;
  }
}
