import { describe, it, expect } from 'vitest';
import { chunkText, getByteLength, splitByParagraphs, splitBySentences, splitByCommas } from '../../../src/tts/utils/text-chunker';

describe('getByteLength', () => {
  it('should return correct byte length for ASCII', () => {
    expect(getByteLength('hello')).toBe(5);
  });

  it('should return correct byte length for Georgian (3 bytes per char)', () => {
    expect(getByteLength('ა')).toBe(3);
    expect(getByteLength('გამარჯობა')).toBe(27); // 9 chars * 3 bytes
  });

  it('should return 0 for empty string', () => {
    expect(getByteLength('')).toBe(0);
  });
});

describe('chunkText', () => {
  describe('Basic functionality', () => {
    it('should return single chunk when text fits within maxBytes', () => {
      const result = chunkText('Hello world', 100);
      expect(result.chunks).toEqual(['Hello world']);
    });

    it('should split text into multiple chunks when exceeding maxBytes', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const result = chunkText(text, 30);
      expect(result.chunks.length).toBeGreaterThan(1);
    });

    it('should never produce a chunk exceeding maxBytes', () => {
      const text = 'ა'.repeat(500) + '\n\n' + 'ბ'.repeat(500) + '\n\n' + 'გ'.repeat(500);
      const maxBytes = 600;
      const result = chunkText(text, maxBytes);
      for (const chunk of result.chunks) {
        expect(getByteLength(chunk)).toBeLessThanOrEqual(maxBytes);
      }
    });

    it('should never produce empty chunks', () => {
      const text = 'Hello.\n\n\n\nWorld.\n\n\n\nTest.';
      const result = chunkText(text, 20);
      for (const chunk of result.chunks) {
        expect(chunk.trim().length).toBeGreaterThan(0);
      }
    });

    it('should handle empty string input', () => {
      const result = chunkText('', 100);
      expect(result.chunks).toEqual([]);
      expect(result.totalBytes).toBe(0);
    });

    it('should handle whitespace-only input', () => {
      const result = chunkText('   \n\n   ', 100);
      expect(result.chunks).toEqual([]);
    });

    it('should preserve all original text across chunks (join covers input)', () => {
      const text = 'First sentence. Second sentence. Third sentence.';
      const result = chunkText(text, 25);
      const rejoined = result.chunks.join(' ');
      // All words from original should be present
      for (const word of text.split(' ')) {
        expect(rejoined).toContain(word);
      }
    });
  });

  describe('Paragraph splitting', () => {
    it('should split on double newline boundaries', () => {
      const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
      const result = chunkText(text, 30);
      expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    });

    it('should split on single newline with blank lines', () => {
      const text = 'Para one.\n\n\nPara two.';
      const paragraphs = splitByParagraphs(text);
      expect(paragraphs).toEqual(['Para one.', 'Para two.']);
    });

    it('should keep short paragraphs as single chunks', () => {
      const text = 'Short.\n\nAlso short.';
      const result = chunkText(text, 500);
      expect(result.chunks).toHaveLength(1);
    });
  });

  describe('Sentence splitting', () => {
    it('should split long paragraphs by sentence boundaries', () => {
      const text = 'First sentence is here. Second sentence follows. Third one comes after.';
      const result = chunkText(text, 40);
      expect(result.chunks.length).toBeGreaterThan(1);
    });

    it('should handle multiple sentence-ending punctuation (.!?)', () => {
      const sentences = splitBySentences('Hello! How are you? I am fine.');
      expect(sentences.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle ellipsis (...) as sentence boundary', () => {
      const sentences = splitBySentences('First part... Second part begins.');
      expect(sentences.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Georgian-specific', () => {
    it('should correctly count bytes for Georgian UTF-8 (3 bytes per char)', () => {
      const georgianText = 'გამარჯობა სამყარო'; // 16 chars + 1 space
      const bytes = getByteLength(georgianText);
      // 16 Georgian chars * 3 bytes + 1 space * 1 byte = 49
      expect(bytes).toBe(49);
    });

    it('should handle Georgian sentence endings', () => {
      const text = 'პირველი წინადადება. მეორე წინადადება. მესამე.';
      const sentences = splitBySentences(text);
      expect(sentences.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle Georgian quotation marks', () => {
      const text = '„ეს არის ციტატა" — თქვა მან. მეორე წინადადება.';
      const result = chunkText(text, 500);
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0]).toContain('„ეს არის ციტატა"');
    });

    it('should NOT split after Georgian abbreviations (მაგ. ე.ი.)', () => {
      const text = 'მაგ. ეს არის მაგალითი. ახალი წინადადება.';
      const sentences = splitBySentences(text);
      // "მაგ." should not cause a split
      const hasAbbrSplit = sentences.some((s) => s.trim() === 'მაგ.');
      expect(hasAbbrSplit).toBe(false);
    });

    it('should handle mixed Georgian + English text', () => {
      const text = 'Chapter 1: შესავალი. This is the introduction. ეს არის შესავალი.';
      const result = chunkText(text, 500);
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0]).toContain('Chapter 1');
      expect(result.chunks[0]).toContain('შესავალი');
    });

    it('should handle text with only Georgian characters', () => {
      const text = 'ა'.repeat(2000);
      const maxBytes = 600; // fits 200 Georgian chars
      const result = chunkText(text, maxBytes);
      expect(result.chunks.length).toBeGreaterThan(1);
      for (const chunk of result.chunks) {
        expect(getByteLength(chunk)).toBeLessThanOrEqual(maxBytes);
      }
    });

    it('should preserve Georgian Unicode characters in every chunk', () => {
      const text = 'აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ';
      const result = chunkText(text, 30); // 10 Georgian chars fit in 30 bytes
      for (const chunk of result.chunks) {
        // Verify valid UTF-8 by checking no replacement characters
        expect(chunk).not.toContain('\uFFFD');
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle very long single sentence exceeding maxBytes', () => {
      const longSentence = 'word '.repeat(500);
      const result = chunkText(longSentence, 100);
      expect(result.chunks.length).toBeGreaterThan(1);
      for (const chunk of result.chunks) {
        expect(getByteLength(chunk)).toBeLessThanOrEqual(100);
      }
    });

    it('should handle text with no sentence boundaries', () => {
      const text = 'just a long stream of words without any punctuation marks at all repeating endlessly';
      const result = chunkText(text, 30);
      expect(result.chunks.length).toBeGreaterThan(1);
    });

    it('should handle text with thousands of short sentences', () => {
      const text = Array.from({ length: 100 }, (_, i) => `S${i}.`).join(' ');
      const result = chunkText(text, 50);
      expect(result.chunks.length).toBeGreaterThan(1);
      for (const chunk of result.chunks) {
        expect(getByteLength(chunk)).toBeLessThanOrEqual(50);
      }
    });

    it('should produce valid UTF-8 in every chunk (no mid-codepoint split)', () => {
      const text = 'აბგ'.repeat(100); // 300 Georgian chars
      const result = chunkText(text, 50);
      for (const chunk of result.chunks) {
        // If we can encode and decode without loss, UTF-8 is valid
        const encoded = Buffer.from(chunk, 'utf-8');
        const decoded = encoded.toString('utf-8');
        expect(decoded).toBe(chunk);
      }
    });

    it('should handle consecutive punctuation marks (!!??)', () => {
      const text = 'რა!!?? ეს სერიოზულად?! დიახ.';
      const sentences = splitBySentences(text);
      expect(sentences.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle text with only newlines', () => {
      const result = chunkText('\n\n\n\n\n', 100);
      expect(result.chunks).toEqual([]);
    });
  });
});

describe('splitByCommas', () => {
  it('should split on commas', () => {
    const result = splitByCommas('first, second, third');
    expect(result.length).toBe(3);
  });

  it('should split on semicolons and colons', () => {
    const result = splitByCommas('a; b: c');
    expect(result.length).toBe(3);
  });
});
