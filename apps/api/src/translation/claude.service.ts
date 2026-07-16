import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface TranslationResult {
  translatedText: string;
  tokensUsed: number;
}

export interface GlossaryExtractionResult {
  glossary: Record<string, string>;
  tokensUsed: number;
}

// claude-sonnet-4-20250514 (the previous default) is retired — requests to it
// will start failing. Sonnet 5 is the current Sonnet-tier model.
const DEFAULT_MODEL = 'claude-sonnet-5';

const MAX_CHUNK_SIZE = 8000; // ~2000 words per chunk
// Tail of the previous chunk fed to the next one so style/terminology don't
// drift across chunk boundaries within a chapter.
const CONTINUATION_TAIL_CHARS = 600;
// A translated chunk shorter than this fraction of its source is treated as a
// failed/truncated generation and retried once.
const MIN_OUTPUT_RATIO = 0.3;
const MAX_GLOSSARY_ENTRIES = 100;

interface ChapterOptions {
  bookTitle: string;
  chapterNumber: number;
  totalChapters: number;
  glossary?: Record<string, string>;
  previousSummary?: string;
  /** Second editor pass comparing draft vs source (premium tier). */
  editorPass?: boolean;
  onChunkComplete?: (chunkIndex: number, totalChunks: number) => Promise<void>;
}

interface ChunkOptions {
  bookTitle: string;
  chapterNumber: number;
  totalChapters: number;
  glossary?: Record<string, string>;
  previousSummary?: string;
  continuation?: { sourceTail: string; translationTail: string };
}

interface Chunk {
  text: string;
  /** Whitespace that followed this chunk in the source — reused when rejoining. */
  separator: string;
}

@Injectable()
export class ClaudeService implements OnModuleInit {
  private readonly logger = new Logger(ClaudeService.name);
  private client: Anthropic | null = null;
  private _model: string = DEFAULT_MODEL;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    this._model = this.config.get<string>('CLAUDE_MODEL') || DEFAULT_MODEL;

    if (apiKey) {
      this.client = new Anthropic({ apiKey });
      this.logger.log(`Claude API initialized (model: ${this._model})`);
    } else {
      this.logger.error('ANTHROPIC_API_KEY not set — translation DISABLED');
    }
  }

  getModel(): string {
    return this._model;
  }

  /**
   * Calculate how many chunks a chapter will produce without actually splitting.
   */
  estimateChunkCount(contentLength: number): number {
    if (contentLength <= MAX_CHUNK_SIZE) return 1;
    return Math.ceil(contentLength / MAX_CHUNK_SIZE);
  }

  async translateChapter(content: string, options: ChapterOptions): Promise<TranslationResult> {
    if (!this.client) {
      throw new Error('Claude API not configured — set ANTHROPIC_API_KEY');
    }

    // If content is small enough, translate in one go
    if (content.length <= MAX_CHUNK_SIZE) {
      const result = await this.translateChunkValidated(content, options);
      const final = options.editorPass
        ? await this.applyEditorPass(content, result, options)
        : result;
      if (options.onChunkComplete) await options.onChunkComplete(0, 1);
      return final;
    }

    this.logger.log(`Chapter ${options.chapterNumber}: ${content.length} chars — splitting into chunks`);
    const chunks = this.splitIntoChunks(content, MAX_CHUNK_SIZE);
    this.logger.log(`Split into ${chunks.length} chunks`);

    let translatedText = '';
    let totalTokens = 0;
    let previousChunk: { source: string; translation: string } | null = null;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      this.logger.log(`  Chunk ${i + 1}/${chunks.length} (${chunk.text.length} chars)...`);

      const chunkOptions: ChunkOptions = {
        ...options,
        // The chapter-level summary only applies to the first chunk; later
        // chunks get the real tail of the previous chunk instead.
        previousSummary: i === 0 ? options.previousSummary : undefined,
        continuation: previousChunk
          ? {
              sourceTail: previousChunk.source.slice(-CONTINUATION_TAIL_CHARS),
              translationTail: previousChunk.translation.slice(-CONTINUATION_TAIL_CHARS),
            }
          : undefined,
      };

      let result = await this.translateChunkValidated(chunk.text, chunkOptions);
      if (options.editorPass) {
        result = await this.applyEditorPass(chunk.text, result, chunkOptions);
      }

      translatedText += result.translatedText + (i < chunks.length - 1 ? chunk.separator : '');
      totalTokens += result.tokensUsed;
      previousChunk = { source: chunk.text, translation: result.translatedText };

      if (options.onChunkComplete) await options.onChunkComplete(i, chunks.length);
    }

    return { translatedText, tokensUsed: totalTokens };
  }

  /**
   * Translate one chunk, retrying once if the output is suspiciously short
   * (truncated or failed generations shouldn't be saved silently).
   */
  private async translateChunkValidated(
    content: string,
    options: ChunkOptions,
  ): Promise<TranslationResult> {
    const result = await this.translateSingleChunk(content, options);

    const tooShort =
      content.length > 200 &&
      result.translatedText.trim().length < content.length * MIN_OUTPUT_RATIO;
    if (!tooShort) return result;

    this.logger.warn(
      `Chunk output suspiciously short (${result.translatedText.length}/${content.length} chars) — retrying once`,
    );
    const retry = await this.translateSingleChunk(content, options);
    retry.tokensUsed += result.tokensUsed;
    return retry.translatedText.trim().length > result.translatedText.trim().length
      ? retry
      : { ...result, tokensUsed: retry.tokensUsed };
  }

  private async translateSingleChunk(
    content: string,
    options: ChunkOptions,
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

    return {
      translatedText: this.extractText(response),
      tokensUsed: this.countTokens(response),
    };
  }

  /**
   * Editor pass (premium tier): a second call compares the draft against the
   * source and fixes mistranslations, omissions, and unnatural phrasing.
   * Falls back to the draft if the editor output looks broken.
   */
  private async applyEditorPass(
    source: string,
    draft: TranslationResult,
    options: ChunkOptions,
  ): Promise<TranslationResult> {
    try {
      const refined = await this.refineTranslation(source, draft.translatedText, options);
      const combinedTokens = draft.tokensUsed + refined.tokensUsed;

      if (refined.translatedText.trim().length < draft.translatedText.trim().length * 0.5) {
        this.logger.warn('Editor pass output too short — keeping the draft');
        return { ...draft, tokensUsed: combinedTokens };
      }
      return { translatedText: refined.translatedText, tokensUsed: combinedTokens };
    } catch (err) {
      this.logger.warn(
        `Editor pass failed — keeping the draft: ${err instanceof Error ? err.message : err}`,
      );
      return draft;
    }
  }

  private async refineTranslation(
    source: string,
    draft: string,
    options: ChunkOptions,
  ): Promise<TranslationResult> {
    let systemPrompt = `You are a senior Georgian literary editor reviewing a translation from English.

Compare the DRAFT Georgian translation against the ENGLISH SOURCE and produce the final version:
- Fix mistranslations and any omitted or summarized content
- Make the Georgian natural and fluent while staying faithful to the source's style, tone, and register
- Keep proper nouns and terminology consistent`;

    if (options.glossary && Object.keys(options.glossary).length > 0) {
      systemPrompt += '\n\nGLOSSARY (these translations are mandatory):';
      for (const [english, georgian] of Object.entries(options.glossary)) {
        systemPrompt += `\n- "${this.sanitize(english, 100)}" → "${this.sanitize(georgian, 100)}"`;
      }
    }

    systemPrompt += `\n
- Preserve the paragraph structure of the draft
- Output ONLY the final Georgian text — no notes, no commentary, no diff`;

    const response = await this.client!.messages.create({
      model: this._model,
      max_tokens: 16000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `ENGLISH SOURCE:\n${source}\n\n---\n\nDRAFT GEORGIAN TRANSLATION:\n${draft}`,
        },
      ],
    }, {
      timeout: 300000,
    });

    return {
      translatedText: this.extractText(response),
      tokensUsed: this.countTokens(response),
    };
  }

  /**
   * Extract proper nouns (characters, places, terms) from source text and
   * transliterate them to Georgian, respecting already-established entries.
   * The result feeds the GLOSSARY prompt section so names stay consistent
   * across chunks and chapters.
   */
  async extractGlossaryTerms(
    sourceText: string,
    existing: Record<string, string> = {},
  ): Promise<GlossaryExtractionResult> {
    if (!this.client) return { glossary: {}, tokensUsed: 0 };
    if (Object.keys(existing).length >= MAX_GLOSSARY_ENTRIES) {
      return { glossary: {}, tokensUsed: 0 };
    }

    let prompt = `From the following English text, extract proper nouns that need a consistent Georgian transliteration: character names, place names, organizations, and recurring invented terms. Skip common words and one-off mentions of real-world places with obvious Georgian forms.`;

    const existingEntries = Object.entries(existing);
    if (existingEntries.length > 0) {
      prompt += `\n\nAlready established (do NOT repeat or change these):`;
      for (const [english, georgian] of existingEntries) {
        prompt += `\n- "${this.sanitize(english, 100)}" → "${this.sanitize(georgian, 100)}"`;
      }
    }

    prompt += `\n\nReturn ONLY a JSON object mapping each NEW English name to its Georgian transliteration, e.g. {"John":"ჯონი"}. Return {} if there is nothing new.\n\nTEXT:\n${sourceText}`;

    const response = await this.client.messages.create({
      model: this._model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }, {
      timeout: 120000,
    });

    const tokensUsed = this.countTokens(response);
    const raw = this.extractText(response);

    try {
      const jsonText = raw.replace(/```(?:json)?/g, '').trim();
      const start = jsonText.indexOf('{');
      const end = jsonText.lastIndexOf('}');
      if (start === -1 || end === -1) return { glossary: {}, tokensUsed };

      const parsed = JSON.parse(jsonText.slice(start, end + 1)) as Record<string, unknown>;
      const glossary: Record<string, string> = {};
      const budget = MAX_GLOSSARY_ENTRIES - existingEntries.length;

      for (const [key, value] of Object.entries(parsed)) {
        if (Object.keys(glossary).length >= budget) break;
        if (typeof value === 'string' && key.trim() && value.trim() && !(key in existing)) {
          glossary[this.sanitize(key, 100)] = this.sanitize(value, 100);
        }
      }
      return { glossary, tokensUsed };
    } catch {
      this.logger.warn('Glossary extraction returned unparseable JSON — skipping');
      return { glossary: {}, tokensUsed };
    }
  }

  /**
   * Split text into chunks without ever cutting mid-sentence (or mid-word),
   * preserving the original whitespace separators for lossless rejoining.
   */
  private splitIntoChunks(text: string, maxSize: number): Chunk[] {
    // Paragraph units keep their trailing newlines so the source structure
    // survives the round trip.
    const parts = text.split(/(\n+)/);
    const units: string[] = [];
    for (let i = 0; i < parts.length; i += 2) {
      const unit = parts[i] + (parts[i + 1] || '');
      if (unit) units.push(unit);
    }

    const rawChunks: string[] = [];
    let current = '';

    const flush = () => {
      if (current) {
        rawChunks.push(current);
        current = '';
      }
    };

    for (const unit of units) {
      if (unit.length > maxSize) {
        // Oversized paragraph: fall back to sentence boundaries, never characters.
        for (const piece of this.splitOversizedParagraph(unit, maxSize)) {
          if (current.length + piece.length > maxSize) flush();
          current += piece;
        }
        continue;
      }
      if (current.length + unit.length > maxSize) flush();
      current += unit;
    }
    flush();

    return rawChunks.map((chunk, i) => {
      const match = chunk.match(/\s+$/);
      const separator = i === rawChunks.length - 1 ? '' : match ? match[0] : ' ';
      return { text: match ? chunk.slice(0, -match[0].length) : chunk, separator };
    });
  }

  private splitOversizedParagraph(text: string, maxSize: number): string[] {
    const sentences = text
      .split(/(?<=[.!?…"”'])\s+/)
      .map((s, i, arr) => (i < arr.length - 1 ? s + ' ' : s));

    const pieces: string[] = [];
    for (const sentence of sentences) {
      if (sentence.length <= maxSize) {
        pieces.push(sentence);
        continue;
      }
      // Pathological: a single "sentence" longer than the chunk size —
      // break at whitespace so we never cut a word in half.
      let rest = sentence;
      while (rest.length > maxSize) {
        let cut = rest.lastIndexOf(' ', maxSize);
        if (cut <= 0) cut = maxSize;
        pieces.push(rest.slice(0, cut + 1));
        rest = rest.slice(cut + 1);
      }
      if (rest) pieces.push(rest);
    }
    return pieces;
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

    return this.extractText(response);
  }

  private buildSystemPrompt(options: ChunkOptions): string {
    const sanitizedTitle = this.sanitize(options.bookTitle, 200);

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
        prompt += `\n- "${this.sanitize(english, 100)}" → "${this.sanitize(georgian, 100)}"`;
      }
    }

    if (options.continuation) {
      prompt += `\n\nCONTINUATION: This text continues mid-chapter, directly after the passage below. Continue seamlessly — same style, register, and terminology. Do NOT re-translate or repeat the previous passage.
PREVIOUS SOURCE (ending):
${options.continuation.sourceTail}
PREVIOUS TRANSLATION (ending):
${options.continuation.translationTail}`;
    }

    if (options.previousSummary) {
      prompt += `\n\nPREVIOUS CHAPTER CONTEXT:\n${options.previousSummary.slice(0, 1000)}`;
    }

    return prompt;
  }

  private extractText(response: Anthropic.Message): string {
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }

  private countTokens(response: Anthropic.Message): number {
    return (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
  }

  /** Strip newlines and cap length — user-controlled strings go into prompts. */
  private sanitize(value: string, maxLength: number): string {
    return value.replace(/[\n\r]/g, ' ').slice(0, maxLength);
  }
}
