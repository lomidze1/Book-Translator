import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export interface TranslationResult {
  translatedText: string;
  tokensUsed: number;
}

@Injectable()
export class ClaudeService {
  private client: Anthropic | null;
  private model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    } else {
      console.warn('⚠️  ANTHROPIC_API_KEY not set — translation disabled');
      this.client = null;
    }
    this.model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
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

    const systemPrompt = this.buildSystemPrompt(options);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Translate the following text from English to Georgian:\n\n${content}`,
        },
      ],
    });

    const translatedText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    return { translatedText, tokensUsed };
  }

  async generateChapterSummary(translatedText: string): Promise<string> {
    if (!this.client) return '';

    const response = await this.client.messages.create({
      model: this.model,
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
    let prompt = `You are a professional literary translator specializing in English to Georgian translation.

BOOK: "${options.bookTitle}"
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
        prompt += `\n- "${english}" → "${georgian}"`;
      }
    }

    if (options.previousSummary) {
      prompt += `\n\nPREVIOUS CHAPTER CONTEXT:\n${options.previousSummary}`;
    }

    return prompt;
  }
}
