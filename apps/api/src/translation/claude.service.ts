import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface TranslationResult {
  translatedText: string;
  tokensUsed: number;
}

@Injectable()
export class ClaudeService implements OnModuleInit {
  private readonly logger = new Logger(ClaudeService.name);
  private client: Anthropic | null = null;
  private _model: string = 'claude-sonnet-4-20250514';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    // Try ConfigService first, then process.env, then manually parse .env
    let apiKey = this.config.get<string>('ANTHROPIC_API_KEY') || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      // Fallback: manually parse .env file
      try {
        const fs = require('fs');
        const path = require('path');
        const envPath = path.resolve(__dirname, '../../.env');
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/^ANTHROPIC_API_KEY=(.+)$/m);
        if (match) {
          apiKey = match[1].trim();
          process.env.ANTHROPIC_API_KEY = apiKey; // Set for other services
          this.logger.log('Loaded ANTHROPIC_API_KEY from .env file directly');
        }
      } catch (err) {
        this.logger.warn(`Could not read .env: ${err}`);
      }
    }

    this._model = this.config.get<string>('CLAUDE_MODEL') || process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

    if (apiKey) {
      this.client = new Anthropic({ apiKey });
      this.logger.log(`✅ Claude API initialized (model: ${this._model}, key: ${apiKey.slice(0, 12)}...)`);
    } else {
      this.logger.error('❌ ANTHROPIC_API_KEY not set — translation DISABLED');
    }
  }

  getModel(): string {
    return this._model;
  }

  async translateChapter(
    content: string,
    options: {
      bookTitle: string;
      chapterNumber: number;
      totalChapters: number;
      glossary?: Record<string, string>;
      previousSummary?: string;
    },
  ): Promise<TranslationResult> {
    if (!this.client) {
      throw new Error('Claude API not configured — set ANTHROPIC_API_KEY');
    }

    const MAX_CHUNK_SIZE = 8000; // ~2000 words per chunk

    // If content is small enough, translate in one go
    if (content.length <= MAX_CHUNK_SIZE) {
      return this.translateSingleChunk(content, options);
    }

    // Split into chunks by paragraphs
    this.logger.log(`Chapter ${options.chapterNumber}: ${content.length} chars — splitting into chunks`);
    const chunks = this.splitIntoChunks(content, MAX_CHUNK_SIZE);
    this.logger.log(`Split into ${chunks.length} chunks`);

    let translatedText = '';
    let totalTokens = 0;

    for (let i = 0; i < chunks.length; i++) {
      this.logger.log(`  Chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
      const result = await this.translateSingleChunk(chunks[i], {
        ...options,
        previousSummary: i > 0 ? `[Continuation of chapter ${options.chapterNumber}, part ${i + 1}]` : options.previousSummary,
      });
      translatedText += (i > 0 ? '\n\n' : '') + result.translatedText;
      totalTokens += result.tokensUsed;
    }

    return { translatedText, tokensUsed: totalTokens };
  }

  private async translateSingleChunk(
    content: string,
    options: {
      bookTitle: string;
      chapterNumber: number;
      totalChapters: number;
      glossary?: Record<string, string>;
      previousSummary?: string;
    },
  ): Promise<TranslationResult> {
    const systemPrompt = this.buildSystemPrompt(options);

    const response = await this.client!.messages.create({
      model: this._model,
      max_tokens: 16000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Translate the following text from English to Georgian:\n\n${content}`,
        },
      ],
    }, {
      timeout: 300000,
    });

    const translatedText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    return { translatedText, tokensUsed };
  }

  private splitIntoChunks(text: string, maxSize: number): string[] {
    // Try splitting by double newlines first, then single, then sentences
    let segments = text.split(/\n\n+/);
    if (segments.length <= 1) segments = text.split(/\n/);
    if (segments.length <= 1) segments = text.split(/(?<=[.!?])\s+/);

    const chunks: string[] = [];
    let current = '';

    for (const seg of segments) {
      if (current.length + seg.length + 2 > maxSize && current.length > 0) {
        chunks.push(current.trim());
        current = seg;
      } else {
        current += (current ? '\n' : '') + seg;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    // If still too large (no split points found), force split by character count
    const result: string[] = [];
    for (const chunk of chunks) {
      if (chunk.length <= maxSize) {
        result.push(chunk);
      } else {
        for (let i = 0; i < chunk.length; i += maxSize) {
          result.push(chunk.slice(i, i + maxSize));
        }
      }
    }

    return result;
  }

  async generateChapterSummary(translatedText: string): Promise<string> {
    if (!this.client) return '';

    const response = await this.client.messages.create({
      model: this._model,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Summarize this chapter in 2-3 sentences in Georgian for context continuity:\n\n${translatedText.slice(0, 3000)}`,
        },
      ],
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }

  private buildSystemPrompt(options: {
    bookTitle: string;
    chapterNumber: number;
    totalChapters: number;
    glossary?: Record<string, string>;
    previousSummary?: string;
  }): string {
    // Sanitize user-controlled strings to prevent prompt injection
    const sanitizedTitle = options.bookTitle.replace(/[\n\r]/g, ' ').slice(0, 200);

    let prompt = `You are a professional literary translator specializing in English to Georgian translation.

BOOK: "${sanitizedTitle}"
CHAPTER: ${options.chapterNumber} of ${options.totalChapters}

RULES:
- Translate from English to Georgian (ქართული)
- Maintain the author's writing style, tone, and voice
- Use natural, fluent Georgian — not word-for-word translation
- Preserve paragraph structure and formatting
- Keep proper nouns transliterated consistently (e.g., "John" → "ჯონი")
- Preserve any numbered lists, headings, or special formatting
- Do NOT add translator notes or commentary
- Do NOT skip or summarize any content — translate everything
- Output ONLY the translated text`;

    if (options.glossary && Object.keys(options.glossary).length > 0) {
      prompt += '\n\nGLOSSARY (use these translations consistently):';
      for (const [english, georgian] of Object.entries(options.glossary)) {
        // Sanitize glossary entries
        const cleanEng = english.replace(/[\n\r]/g, ' ').slice(0, 100);
        const cleanGeo = georgian.replace(/[\n\r]/g, ' ').slice(0, 100);
        prompt += `\n- "${cleanEng}" → "${cleanGeo}"`;
      }
    }

    if (options.previousSummary) {
      prompt += `\n\nPREVIOUS CHAPTER CONTEXT:\n${options.previousSummary.slice(0, 1000)}`;
    }

    return prompt;
  }
}
