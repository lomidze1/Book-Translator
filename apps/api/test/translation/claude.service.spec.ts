import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeService } from '../../src/translation/claude.service';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  }));
  // Make it work as both `new Anthropic()` and `import Anthropic from ...`
  MockAnthropic.prototype.constructor = MockAnthropic;
  return {
    default: MockAnthropic,
    Anthropic: MockAnthropic,
  };
});

describe('ClaudeService', () => {
  let service: ClaudeService;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    service = new ClaudeService();
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
      delete process.env.ANTHROPIC_API_KEY;
      const noKeyService = new ClaudeService();

      await expect(
        noKeyService.translateChapter('text', {
          bookTitle: 'Book',
          chapterNumber: 1,
          totalChapters: 1,
        }),
      ).rejects.toThrow('ANTHROPIC_API_KEY');
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
      process.env.CLAUDE_MODEL = 'claude-opus-4-20250514';
      const customService = new ClaudeService();
      expect(customService.getModel()).toBe('claude-opus-4-20250514');
      delete process.env.CLAUDE_MODEL;
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
      const defaultService = new ClaudeService();
      expect(defaultService.getModel()).toBe('claude-sonnet-4-20250514');
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
      delete process.env.ANTHROPIC_API_KEY;
      const noKeyService = new ClaudeService();
      const summary = await noKeyService.generateChapterSummary('text');
      expect(summary).toBe('');
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
