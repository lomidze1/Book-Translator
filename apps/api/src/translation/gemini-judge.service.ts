import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithTimeout } from '../common/fetch';

export interface JudgeScores {
  /** Faithfulness to the source (1-5). */
  accuracy: number;
  /** Naturalness of the Georgian (1-5). */
  fluency: number;
  /** Terminology/style consistency (1-5). */
  consistency: number;
  overall: number;
  issues: Array<{ type: string; quote?: string; note?: string }>;
}

const DEFAULT_MODEL = 'gemini-2.5-pro';
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * LLM-as-judge for translation quality, deliberately on a different model
 * family than the translator (Claude) to avoid self-preference bias.
 * Disabled when GEMINI_API_KEY is not set — judging is always optional and
 * never blocks or fails a translation.
 */
@Injectable()
export class GeminiJudgeService implements OnModuleInit {
  private readonly logger = new Logger(GeminiJudgeService.name);
  private apiKey: string | null = null;
  private model = DEFAULT_MODEL;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.apiKey = this.config.get<string>('GEMINI_API_KEY') || null;
    this.model = this.config.get<string>('GEMINI_JUDGE_MODEL') || DEFAULT_MODEL;
    if (this.apiKey) {
      this.logger.log(`Gemini judge enabled (model: ${this.model})`);
    } else {
      this.logger.log('GEMINI_API_KEY not set — quality judging disabled');
    }
  }

  isEnabled(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Score one source/translation sample. Returns null when disabled or on
   * any failure — callers must treat judging as best-effort.
   */
  async judgeSample(source: string, translated: string): Promise<JudgeScores | null> {
    if (!this.apiKey) return null;

    const prompt = `You are an expert evaluator of English-to-Georgian literary translation. Compare the TRANSLATION against the SOURCE and score it.

Scoring (1 = very poor, 5 = excellent):
- accuracy: faithfulness to the source — no omissions, additions, or mistranslations
- fluency: how natural the Georgian reads — no calques, no English sentence structure
- consistency: terminology, names, and register used consistently
- overall: your overall judgment as a Georgian reader

Also list concrete issues you found (type: "mistranslation" | "omission" | "calque" | "unnatural" | "terminology"; quote the Georgian fragment; add a short note in Georgian).

Return ONLY a JSON object:
{"accuracy": n, "fluency": n, "consistency": n, "overall": n, "issues": [{"type": "...", "quote": "...", "note": "..."}]}

SOURCE (English):
${source}

TRANSLATION (Georgian):
${translated}`;

    try {
      const response = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0 },
          }),
        },
        REQUEST_TIMEOUT_MS,
      );

      if (!response.ok) {
        this.logger.warn(`Gemini judge HTTP ${response.status} — skipping sample`);
        return null;
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      return this.parseScores(raw);
    } catch (err) {
      this.logger.warn(`Gemini judge failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  private parseScores(raw: string): JudgeScores | null {
    const jsonText = raw.replace(/```(?:json)?/g, '').trim();
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (start === -1 || end === -1) {
      this.logger.warn('Gemini judge returned unparseable output — skipping sample');
      return null;
    }

    try {
      const parsed = JSON.parse(jsonText.slice(start, end + 1)) as Record<string, unknown>;
      const clamp = (value: unknown) =>
        typeof value === 'number' && Number.isFinite(value) ? Math.min(5, Math.max(1, value)) : null;

      const accuracy = clamp(parsed.accuracy);
      const fluency = clamp(parsed.fluency);
      const consistency = clamp(parsed.consistency);
      const overall = clamp(parsed.overall);
      if (accuracy === null || fluency === null || consistency === null || overall === null) {
        this.logger.warn('Gemini judge returned incomplete scores — skipping sample');
        return null;
      }

      const issues = Array.isArray(parsed.issues)
        ? parsed.issues
            .filter((issue): issue is Record<string, unknown> => !!issue && typeof issue === 'object')
            .map((issue) => ({
              type: String(issue.type || 'other'),
              quote: issue.quote ? String(issue.quote) : undefined,
              note: issue.note ? String(issue.note) : undefined,
            }))
        : [];

      return { accuracy, fluency, consistency, overall, issues };
    } catch {
      this.logger.warn('Gemini judge returned invalid JSON — skipping sample');
      return null;
    }
  }
}
