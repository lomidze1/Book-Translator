import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeService } from '../../src/translation/claude.service';
import { ConfigService } from '@nestjs/config';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  }));
  MockAnthropic.prototype.constructor = MockAnthropic;
  return {
    default: MockAnthropic,
    Anthropic: MockAnthropic,
  };
});

function createMockConfigService(overrides: Record<string, string> = {}): ConfigService {
  const defaults: Record<string, string> = {
    ANTHROPIC_API_KEY: 'test-key',
    CLAUDE_MODEL: '',
  };
  const config = { ...defaults, ...overrides };
  return {
    get: vi.fn((key: string) => config[key] || undefined),
  } as unknown as ConfigService;
}

function createService(configOverrides: Record<string, string> = {}): ClaudeService {
  const configService = createMockConfigService(configOverrides);
  const service = new ClaudeService(configService);
  service.onModuleInit();
  return service;
}

describe('ClaudeService', () => {
  let service: ClaudeService;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    service = createService();
    mockCreate = (service as any).client.messages.create;
  });

  describe('translateChapter', () => {
    it('should call Claude API with correct parameters', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'ნათარგმნი ტექსტი' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const result = await service.translateChapter('Hello world', {
        bookTitle: 'Test Book',
        chapterNumber: 1,
        totalChapters: 5,
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(result.translatedText).toBe('ნათარგმნი ტექსტი');
      expect(result.tokensUsed).toBe(150);
    });

    it('should include glossary in system prompt', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'translated' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      await service.translateChapter('Text with John', {
        bookTitle: 'My Book',
        chapterNumber: 1,
        totalChapters: 3,
        glossary: { John: 'ჯონი', 'New York': 'ნიუ-იორკი' },
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toContain('GLOSSARY');
      expect(callArgs.system).toContain('ჯონი');
      expect(callArgs.system).toContain('ნიუ-იორკი');
    });

    it('should include previous summary for context continuity', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'translated' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      await service.translateChapter('Next chapter text', {
        bookTitle: 'My Book',
        chapterNumber: 2,
        totalChapters: 3,
        previousSummary: 'წინა თავში ჯონი სახლში წავიდა.',
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toContain('PREVIOUS CHAPTER CONTEXT');
      expect(callArgs.system).toContain('ჯონი სახლში წავიდა');
    });

    it('should throw if API key not set', async () => {
      const origKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      const origReadFileSync = require('fs').readFileSync;
      require('fs').readFileSync = () => { throw new Error('no .env in test'); };
      try {
        const noKeyService = createService({ ANTHROPIC_API_KEY: '' });
        await expect(
          noKeyService.translateChapter('text', {
            bookTitle: 'Book',
            chapterNumber: 1,
            totalChapters: 1,
          }),
        ).rejects.toThrow();
      } finally {
        process.env.ANTHROPIC_API_KEY = origKey || 'test-key';
        require('fs').readFileSync = origReadFileSync;
      }
    });

    it('should handle multiple text blocks in response', async () => {
      mockCreate.mockResolvedValue({
        content: [
          { type: 'text', text: 'პირველი ' },
          { type: 'text', text: 'მეორე' },
        ],
        usage: { input_tokens: 50, output_tokens: 30 },
      });

      const result = await service.translateChapter('text', {
        bookTitle: 'Book',
        chapterNumber: 1,
        totalChapters: 1,
      });

      expect(result.translatedText).toBe('პირველი მეორე');
    });

    it('should use correct model from environment', () => {
      const customService = createService({ CLAUDE_MODEL: 'claude-opus-4-20250514' });
      expect(customService.getModel()).toBe('claude-opus-4-20250514');
    });

    it('should propagate API errors (network, rate limit)', async () => {
      mockCreate.mockRejectedValue(new Error('429 Rate limit exceeded'));

      await expect(
        service.translateChapter('text', {
          bookTitle: 'Book',
          chapterNumber: 1,
          totalChapters: 1,
        }),
      ).rejects.toThrow('429 Rate limit exceeded');
    });

    it('should return empty translatedText for empty response content', async () => {
      mockCreate.mockResolvedValue({
        content: [],
        usage: { input_tokens: 10, output_tokens: 0 },
      });

      const result = await service.translateChapter('text', {
        bookTitle: 'Book',
        chapterNumber: 1,
        totalChapters: 1,
      });

      expect(result.translatedText).toBe('');
      expect(result.tokensUsed).toBe(10);
    });

    it('should filter out non-text blocks', async () => {
      mockCreate.mockResolvedValue({
        content: [
          { type: 'tool_use', id: 'tool1', name: 'fn', input: {} },
          { type: 'text', text: 'ტექსტი' },
        ],
        usage: { input_tokens: 50, output_tokens: 30 },
      });

      const result = await service.translateChapter('text', {
        bookTitle: 'Book',
        chapterNumber: 1,
        totalChapters: 1,
      });

      expect(result.translatedText).toBe('ტექსტი');
    });

    it('should handle missing usage field gracefully', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'text' }],
        usage: undefined,
      });

      const result = await service.translateChapter('text', {
        bookTitle: 'Book',
        chapterNumber: 1,
        totalChapters: 1,
      });

      expect(result.tokensUsed).toBe(0);
    });

    it('should not include GLOSSARY section when glossary is empty', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'translated' }],
        usage: { input_tokens: 50, output_tokens: 30 },
      });

      await service.translateChapter('text', {
        bookTitle: 'Book',
        chapterNumber: 1,
        totalChapters: 1,
        glossary: {},
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).not.toContain('GLOSSARY');
    });

    it('should sanitize book title (strip newlines, truncate)', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'translated' }],
        usage: { input_tokens: 50, output_tokens: 30 },
      });

      await service.translateChapter('text', {
        bookTitle: 'Title\nWith\rNewlines',
        chapterNumber: 1,
        totalChapters: 1,
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).not.toContain('\n"Title');
      expect(callArgs.system).toContain('Title With Newlines');
    });

    it('should use default model when CLAUDE_MODEL not set', () => {
      delete process.env.CLAUDE_MODEL;
      const defaultService = createService();
      expect(defaultService.getModel()).toBe('claude-sonnet-5');
    });
  });

  describe('chunking', () => {
    it('should never cut words in half and should pass continuation context to later chunks', async () => {
      // ~20KB of text with no newlines — forces sentence-based splitting
      const sentence = 'The quick brown fox jumps over the lazy dog near the riverbank. ';
      const content = sentence.repeat(320); // ~20800 chars → 3 chunks

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'ნათარგმნი '.repeat(500) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      await service.translateChapter(content, {
        bookTitle: 'Book',
        chapterNumber: 1,
        totalChapters: 1,
      });

      expect(mockCreate.mock.calls.length).toBeGreaterThan(1);

      const wordSet = new Set(sentence.trim().split(' ').map((w) => w.replace(/\.$/, '')));
      for (const call of mockCreate.mock.calls) {
        const userContent: string = call[0].messages[0].content;
        const chunkText = userContent.replace(/^Translate the following text from English to Georgian:\n\n/, '');
        // Every chunk must start and end on a word boundary from the source
        const firstWord = chunkText.trim().split(/\s+/)[0].replace(/\.$/, '');
        const lastWord = chunkText.trim().split(/\s+/).pop()!.replace(/\.$/, '');
        expect(wordSet.has(firstWord)).toBe(true);
        expect(wordSet.has(lastWord)).toBe(true);
      }

      // Chunks after the first must carry the previous chunk's tail
      const secondSystem: string = mockCreate.mock.calls[1][0].system;
      expect(secondSystem).toContain('CONTINUATION');
      expect(secondSystem).toContain('PREVIOUS TRANSLATION (ending)');
    });

    it('should retry once when output is suspiciously short', async () => {
      const content = 'A long paragraph of source text. '.repeat(20); // ~660 chars
      mockCreate
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'x' }],
          usage: { input_tokens: 100, output_tokens: 1 },
        })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'სრული თარგმანი. '.repeat(40) }],
          usage: { input_tokens: 100, output_tokens: 200 },
        });

      const result = await service.translateChapter(content, {
        bookTitle: 'Book',
        chapterNumber: 1,
        totalChapters: 1,
      });

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result.translatedText).toContain('სრული თარგმანი');
      expect(result.tokensUsed).toBe(401); // both attempts billed
    });
  });

  describe('editor pass', () => {
    it('should run a second refine call when editorPass is true', async () => {
      mockCreate
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'პირველადი თარგმანი' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'დახვეწილი თარგმანი' }],
          usage: { input_tokens: 80, output_tokens: 40 },
        });

      const result = await service.translateChapter('Short text', {
        bookTitle: 'Book',
        chapterNumber: 1,
        totalChapters: 1,
        editorPass: true,
      });

      expect(mockCreate).toHaveBeenCalledTimes(2);
      const editorCall = mockCreate.mock.calls[1][0];
      expect(editorCall.system).toContain('literary editor');
      expect(editorCall.messages[0].content).toContain('ENGLISH SOURCE');
      expect(editorCall.messages[0].content).toContain('პირველადი თარგმანი');
      expect(result.translatedText).toBe('დახვეწილი თარგმანი');
      expect(result.tokensUsed).toBe(270);
    });

    it('should keep the draft when the editor output is too short', async () => {
      mockCreate
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'სრულფასოვანი პირველადი თარგმანი რომელიც საკმაოდ გრძელია' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'x' }],
          usage: { input_tokens: 80, output_tokens: 1 },
        });

      const result = await service.translateChapter('Short text', {
        bookTitle: 'Book',
        chapterNumber: 1,
        totalChapters: 1,
        editorPass: true,
      });

      expect(result.translatedText).toContain('სრულფასოვანი პირველადი');
    });

    it('should keep the draft when the editor call throws', async () => {
      mockCreate
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'პირველადი თარგმანი' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        })
        .mockRejectedValueOnce(new Error('529 Overloaded'));

      const result = await service.translateChapter('Short text', {
        bookTitle: 'Book',
        chapterNumber: 1,
        totalChapters: 1,
        editorPass: true,
      });

      expect(result.translatedText).toBe('პირველადი თარგმანი');
    });
  });

  describe('extractGlossaryTerms', () => {
    it('should parse the returned JSON and skip existing entries', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '```json\n{"John":"ჯონი","Mary":"მერი"}\n```' }],
        usage: { input_tokens: 200, output_tokens: 30 },
      });

      const result = await service.extractGlossaryTerms('John met Mary.', { John: 'ჯონი' });

      expect(result.glossary).toEqual({ Mary: 'მერი' });
      expect(result.tokensUsed).toBe(230);
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('Already established');
      expect(callArgs.messages[0].content).toContain('ჯონი');
    });

    it('should return empty glossary on unparseable output', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'no json here' }],
        usage: { input_tokens: 200, output_tokens: 10 },
      });

      const result = await service.extractGlossaryTerms('Some text.');
      expect(result.glossary).toEqual({});
      expect(result.tokensUsed).toBe(210);
    });

    it('should return empty result without API key', async () => {
      const origReadFileSync = require('fs').readFileSync;
      require('fs').readFileSync = () => { throw new Error('no .env in test'); };
      try {
        const noKeyService = createService({ ANTHROPIC_API_KEY: '' });
        const result = await noKeyService.extractGlossaryTerms('text');
        expect(result).toEqual({ glossary: {}, tokensUsed: 0 });
      } finally {
        require('fs').readFileSync = origReadFileSync;
      }
    });
  });

  describe('generateChapterSummary', () => {
    it('should return summary text', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'ეს თავი მოგვითხრობს...' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const summary = await service.generateChapterSummary('Long translated text here...');
      expect(summary).toBe('ეს თავი მოგვითხრობს...');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should return empty string if no API key', async () => {
      const origKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      // Also prevent .env file fallback from finding the key
      const origReadFileSync = require('fs').readFileSync;
      require('fs').readFileSync = () => { throw new Error('no .env in test'); };
      try {
        const noKeyService = createService({ ANTHROPIC_API_KEY: '' });
        const summary = await noKeyService.generateChapterSummary('text');
        expect(summary).toBe('');
      } finally {
        process.env.ANTHROPIC_API_KEY = origKey || 'test-key';
        require('fs').readFileSync = origReadFileSync;
      }
    });

    it('should truncate input to 3000 chars', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'summary' }],
        usage: { input_tokens: 50, output_tokens: 10 },
      });

      const longText = 'a'.repeat(10000);
      await service.generateChapterSummary(longText);

      const callArgs = mockCreate.mock.calls[0][0];
      const userContent = callArgs.messages[0].content;
      // The input should be truncated (content after slice should be ~3000 chars, not 10000)
      expect(userContent.length).toBeLessThan(10000);
    });

    it('should propagate API errors from generateChapterSummary', async () => {
      mockCreate.mockRejectedValue(new Error('API timeout'));

      await expect(service.generateChapterSummary('some text')).rejects.toThrow('API timeout');
    });
  });
});
