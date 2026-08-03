import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { GEORGIAN_STYLE_RULES } from './georgian-style-rules';

export interface TranslationResult {
  translatedText: string;
  tokensUsed: number;
}

/** A glossary term with the metadata Georgian translation actually needs. */
export interface GlossaryEntry {
  /** The Georgian form. */
  ka: string;
  type?: 'character' | 'place' | 'organization' | 'term';
  /**
   * Characters only. Georgian has no grammatical gender — this exists so the
   * model can repeat a name where genderless "ის" would be ambiguous.
   */
  gender?: 'male' | 'female';
}

/**
 * Persisted glossaries predate the rich shape, so both are accepted on read:
 * a bare string is the Georgian form.
 */
export type Glossary = Record<string, string | GlossaryEntry>;

export interface GlossaryExtractionResult {
  glossary: Record<string, GlossaryEntry>;
  tokensUsed: number;
}

export interface StyleGuideResult {
  styleGuide: string;
  tokensUsed: number;
}

export interface StorySummaryResult {
  summary: string;
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
// Proper-noun extraction reads the whole chapter in windows — a character
// introduced on page 30 was invisible when only the opening was scanned.
const GLOSSARY_WINDOW_CHARS = 12000;
const MAX_GLOSSARY_WINDOWS = 4;
// The rolling story summary reads the head and tail of each chapter so late
// plot turns are not lost.
const SUMMARY_HEAD_CHARS = 6000;
const SUMMARY_TAIL_CHARS = 3000;

interface ChapterOptions {
  bookTitle: string;
  chapterNumber: number;
  totalChapters: number;
  glossary?: Glossary;
  previousSummary?: string;
  /** Book-level brief: genre, register, narrative voice, address forms. */
  styleGuide?: string;
  /** Second editor pass comparing draft vs source (premium tier). */
  editorPass?: boolean;
  onChunkComplete?: (chunkIndex: number, totalChunks: number) => Promise<void>;
}

interface ChunkOptions {
  bookTitle: string;
  chapterNumber: number;
  totalChapters: number;
  glossary?: Glossary;
  previousSummary?: string;
  styleGuide?: string;
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
- Keep proper nouns and terminology consistent

${GEORGIAN_STYLE_RULES}`;

    if (options.styleGuide?.trim()) {
      systemPrompt += `\n\nBOOK STYLE GUIDE:\n${options.styleGuide.slice(0, 2000)}`;
    }

    systemPrompt += this.renderGlossary(options.glossary, 'GLOSSARY (these translations are mandatory):');

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
    existing: Glossary = {},
  ): Promise<GlossaryExtractionResult> {
    if (!this.client) return { glossary: {}, tokensUsed: 0 };

    // Established terms accumulate across windows so a name found on page 1
    // is not re-proposed (with a different spelling) on page 30.
    const known = this.normalizeGlossary(existing);
    const found: Record<string, GlossaryEntry> = {};
    let tokensUsed = 0;

    const windows = this.splitForGlossaryScan(sourceText);
    for (const window of windows) {
      if (Object.keys(known).length >= MAX_GLOSSARY_ENTRIES) break;

      const result = await this.extractGlossaryWindow(window, known);
      tokensUsed += result.tokensUsed;
      Object.assign(found, result.glossary);
      Object.assign(known, result.glossary);
    }

    return { glossary: found, tokensUsed };
  }

  /** Whole-chapter coverage, capped so a huge chapter cannot run away. */
  private splitForGlossaryScan(text: string): string[] {
    if (text.length <= GLOSSARY_WINDOW_CHARS) return [text];
    const windows: string[] = [];
    for (
      let i = 0;
      i < text.length && windows.length < MAX_GLOSSARY_WINDOWS;
      i += GLOSSARY_WINDOW_CHARS
    ) {
      windows.push(text.slice(i, i + GLOSSARY_WINDOW_CHARS));
    }
    return windows;
  }

  private async extractGlossaryWindow(
    sourceText: string,
    known: Record<string, GlossaryEntry>,
  ): Promise<GlossaryExtractionResult> {
    let prompt = `From the following English text, extract proper nouns that need a consistent Georgian transliteration: character names, place names, organizations, and recurring invented terms. Skip common words and one-off mentions of real-world places with obvious Georgian forms.`;

    const knownEntries = Object.entries(known);
    if (knownEntries.length > 0) {
      prompt += `\n\nAlready established (do NOT repeat or change these):`;
      for (const [english, entry] of knownEntries) {
        prompt += `\n- "${this.sanitize(english, 100)}" → "${this.sanitize(entry.ka, 100)}"`;
      }
    }

    prompt += `\n\nFor each NEW name return the Georgian form plus its type ("character", "place", "organization" or "term"). For characters also give "gender" ("male" or "female") when the text makes it clear — Georgian pronouns are genderless, so the translator needs this to avoid ambiguity.

Return ONLY a JSON object, e.g.:
{"John":{"ka":"ჯონი","type":"character","gender":"male"},"London":{"ka":"ლონდონი","type":"place"}}
Return {} if there is nothing new.

TEXT:
${sourceText}`;

    const response = await this.client!.messages.create({
      model: this._model,
      max_tokens: 2000,
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
      const glossary: Record<string, GlossaryEntry> = {};
      const budget = MAX_GLOSSARY_ENTRIES - knownEntries.length;

      for (const [key, value] of Object.entries(parsed)) {
        if (Object.keys(glossary).length >= budget) break;
        if (!key.trim() || key in known) continue;
        const entry = this.toGlossaryEntry(value);
        if (entry) glossary[this.sanitize(key, 100)] = entry;
      }
      return { glossary, tokensUsed };
    } catch {
      this.logger.warn('Glossary extraction returned unparseable JSON — skipping');
      return { glossary: {}, tokensUsed };
    }
  }

  /** Accepts both the rich object form and the legacy bare-string form. */
  private toGlossaryEntry(value: unknown): GlossaryEntry | null {
    if (typeof value === 'string') {
      return value.trim() ? { ka: this.sanitize(value, 100) } : null;
    }
    if (!value || typeof value !== 'object') return null;

    const raw = value as Record<string, unknown>;
    const ka = typeof raw.ka === 'string' ? raw.ka.trim() : '';
    if (!ka) return null;

    const entry: GlossaryEntry = { ka: this.sanitize(ka, 100) };
    const type = String(raw.type || '');
    if (['character', 'place', 'organization', 'term'].includes(type)) {
      entry.type = type as GlossaryEntry['type'];
    }
    const gender = String(raw.gender || '');
    if (entry.type === 'character' && (gender === 'male' || gender === 'female')) {
      entry.gender = gender;
    }
    return entry;
  }

  /** Normalize a persisted glossary (either shape) to the rich form. */
  normalizeGlossary(glossary: Glossary = {}): Record<string, GlossaryEntry> {
    const normalized: Record<string, GlossaryEntry> = {};
    for (const [key, value] of Object.entries(glossary)) {
      const entry = this.toGlossaryEntry(value);
      if (entry) normalized[key] = entry;
    }
    return normalized;
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

  /**
   * One call at the start of a book: read samples from the beginning, middle
   * and end and write the brief a human translator would be given — genre,
   * era, narrative voice, dialogue register, address forms. Every chunk then
   * translates against the same brief instead of re-guessing the tone.
   */
  async generateStyleGuide(samples: string[], bookTitle: string): Promise<StyleGuideResult> {
    if (!this.client) return { styleGuide: '', tokensUsed: 0 };

    const sampleText = samples
      .filter((sample) => sample?.trim())
      .map((sample, i) => `--- SAMPLE ${i + 1} ---\n${sample.slice(0, 4000)}`)
      .join('\n\n');
    if (!sampleText) return { styleGuide: '', tokensUsed: 0 };

    const prompt = `You are briefing a Georgian literary translator before they start "${this.sanitize(bookTitle, 200)}". Read the samples and write the brief.

Cover, in Georgian, briefly and concretely:
- ჟანრი და ეპოქა (genre and period)
- თხრობის ხმა (narrative voice: person, tense, distance)
- რეგისტრი (register: archaic/neutral/colloquial — and how to render it in Georgian)
- დიალოგის ტონი (how characters speak to each other)
- მიმართვის ფორმა (შენ/თქვენ per character pair, with the reason)
- განმეორებადი მოტივები ან ტერმინოლოგია (recurring motifs or terminology to keep consistent)

Write at most 250 words. No preamble, no headings other than the six above.

SAMPLES:
${sampleText}`;

    const response = await this.client.messages.create({
      model: this._model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }, {
      timeout: 180000,
    });

    return {
      styleGuide: this.extractText(response).trim(),
      tokensUsed: this.countTokens(response),
    };
  }

  /**
   * Rolling plot memory. Built from the SOURCE chapter (not the translation)
   * and folded into the running summary, so chapter 20 knows what happened in
   * chapter 5 — the old per-chapter summary only saw the first 3000 characters
   * of the chapter that had just been translated.
   */
  async generateStorySummary(
    sourceChapter: string,
    previousSummary?: string,
  ): Promise<StorySummaryResult> {
    if (!this.client) return { summary: '', tokensUsed: 0 };

    let prompt = 'You maintain a running plot summary for a translator working chapter by chapter.\n\n';
    if (previousSummary?.trim()) {
      prompt += `STORY SO FAR:\n${previousSummary.slice(0, 3000)}\n\n`;
    }
    prompt += `NEW CHAPTER (English source):\n${this.sampleHeadAndTail(sourceChapter)}\n\n`;
    prompt += `Rewrite the running summary in Georgian so it covers the story through this chapter: who the characters are, their relationships, and the plot state. Keep what still matters, drop what no longer does. At most 200 words. Output only the summary.`;

    const response = await this.client.messages.create({
      model: this._model,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }, {
      timeout: 120000,
    });

    return {
      summary: this.extractText(response).trim(),
      tokensUsed: this.countTokens(response),
    };
  }

  /** Head + tail of a long chapter, so late plot turns survive truncation. */
  private sampleHeadAndTail(text: string): string {
    if (text.length <= SUMMARY_HEAD_CHARS + SUMMARY_TAIL_CHARS) return text;
    return `${text.slice(0, SUMMARY_HEAD_CHARS)}\n\n[...]\n\n${text.slice(-SUMMARY_TAIL_CHARS)}`;
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
- Output ONLY the translated text

${GEORGIAN_STYLE_RULES}`;

    if (options.styleGuide?.trim()) {
      prompt += `\n\nBOOK STYLE GUIDE (follow it for the whole book):\n${options.styleGuide.slice(0, 2000)}`;
    }

    prompt += this.renderGlossary(options.glossary, 'GLOSSARY (use these translations consistently):');

    if (options.continuation) {
      prompt += `\n\nCONTINUATION: This text continues mid-chapter, directly after the passage below. Continue seamlessly — same style, register, and terminology. Do NOT re-translate or repeat the previous passage.
PREVIOUS SOURCE (ending):
${options.continuation.sourceTail}
PREVIOUS TRANSLATION (ending):
${options.continuation.translationTail}`;
    }

    if (options.previousSummary) {
      prompt += `\n\nSTORY SO FAR (context only — do not translate this):\n${options.previousSummary.slice(0, 1500)}`;
    }

    return prompt;
  }

  /**
   * Render glossary entries, including type and gender when known, so the
   * model can decline names correctly and disambiguate genderless pronouns.
   */
  private renderGlossary(glossary: Glossary | undefined, heading: string): string {
    const entries = Object.entries(this.normalizeGlossary(glossary));
    if (entries.length === 0) return '';

    let section = `\n\n${heading}`;
    for (const [english, entry] of entries) {
      const meta = [entry.type, entry.gender].filter(Boolean).join(', ');
      section += `\n- "${this.sanitize(english, 100)}" → "${this.sanitize(entry.ka, 100)}"${meta ? ` (${meta})` : ''}`;
    }
    return section;
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
