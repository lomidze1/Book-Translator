import { Injectable } from '@nestjs/common';

export type QualityFlag =
  | 'LATIN_LEAKAGE'
  | 'NUMBER_MISMATCH'
  | 'PARAGRAPH_MISMATCH'
  | 'REPETITION'
  | 'EMPTY_OUTPUT';

export interface ChapterQualityReport {
  flags: QualityFlag[];
  /** Share of Latin-script words among all words in the translated text. */
  latinRatio: number;
  latinSamples: string[];
  /** Numbers present in the source but absent from the translation. */
  missingNumbers: string[];
  /** Numbers present in the translation but absent from the source. */
  extraNumbers: string[];
  sourceParagraphs: number;
  translatedParagraphs: number;
  /** Consecutive duplicate paragraphs — a sign of a generation loop. */
  repeatedParagraphs: number;
}

export interface QualitySummary {
  chaptersChecked: number;
  chaptersFlagged: number;
  flagCounts: Partial<Record<QualityFlag, number>>;
}

// A handful of Latin proper nouns/acronyms is normal; a run of untranslated
// English is not. Both conditions must hold to flag.
const LATIN_MIN_WORDS = 3;
const LATIN_MAX_RATIO = 0.05;
// Paragraph-count drift beyond this share (on texts of 4+ paragraphs) means
// the translation collapsed or invented structure.
const PARAGRAPH_MIN_SOURCE = 4;
const PARAGRAPH_MAX_DRIFT = 0.3;
// Short duplicate lines ("* * *", dialogue beats) are legitimate.
const REPETITION_MIN_LENGTH = 20;

/**
 * Cheap, deterministic quality checks on a translated chapter — no API calls.
 * Catches the failure modes an LLM judge is overkill for: untranslated
 * passages, dropped numbers, collapsed paragraphs, generation loops.
 */
@Injectable()
export class QualityCheckService {
  checkChapter(source: string, translated: string): ChapterQualityReport {
    const report: ChapterQualityReport = {
      flags: [],
      latinRatio: 0,
      latinSamples: [],
      missingNumbers: [],
      extraNumbers: [],
      sourceParagraphs: this.countParagraphs(source),
      translatedParagraphs: this.countParagraphs(translated),
      repeatedParagraphs: 0,
    };

    if (!translated.trim()) {
      report.flags.push('EMPTY_OUTPUT');
      return report;
    }

    // Untranslated English leaking through
    const words = translated.split(/\s+/).filter((w) => w);
    const latinWords = translated.match(/[A-Za-z]{2,}/g) || [];
    report.latinRatio = words.length
      ? Math.round((latinWords.length / words.length) * 1000) / 1000
      : 0;
    report.latinSamples = [...new Set(latinWords)].slice(0, 10);
    if (latinWords.length >= LATIN_MIN_WORDS && report.latinRatio > LATIN_MAX_RATIO) {
      report.flags.push('LATIN_LEAKAGE');
    }

    // Dropped or invented numbers
    const sourceNumbers = this.extractNumbers(source);
    const translatedNumbers = this.extractNumbers(translated);
    report.missingNumbers = this.multisetDiff(sourceNumbers, translatedNumbers);
    report.extraNumbers = this.multisetDiff(translatedNumbers, sourceNumbers);
    if (report.missingNumbers.length > 0) {
      report.flags.push('NUMBER_MISMATCH');
    }

    // Collapsed/exploded paragraph structure
    if (report.sourceParagraphs >= PARAGRAPH_MIN_SOURCE) {
      const drift =
        Math.abs(report.sourceParagraphs - report.translatedParagraphs) / report.sourceParagraphs;
      if (drift > PARAGRAPH_MAX_DRIFT) {
        report.flags.push('PARAGRAPH_MISMATCH');
      }
    }

    // Generation loops: the same paragraph emitted back to back
    const paragraphs = translated
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p);
    for (let i = 1; i < paragraphs.length; i++) {
      if (paragraphs[i].length >= REPETITION_MIN_LENGTH && paragraphs[i] === paragraphs[i - 1]) {
        report.repeatedParagraphs++;
      }
    }
    if (report.repeatedParagraphs > 0) {
      report.flags.push('REPETITION');
    }

    return report;
  }

  summarize(reports: ChapterQualityReport[]): QualitySummary {
    const flagCounts: Partial<Record<QualityFlag, number>> = {};
    let chaptersFlagged = 0;
    for (const report of reports) {
      if (report.flags.length > 0) chaptersFlagged++;
      for (const flag of report.flags) {
        flagCounts[flag] = (flagCounts[flag] || 0) + 1;
      }
    }
    return { chaptersChecked: reports.length, chaptersFlagged, flagCounts };
  }

  private countParagraphs(text: string): number {
    return text.split(/\n+/).filter((p) => p.trim()).length;
  }

  /** Digit sequences, canonicalized so "1,000" and "1000" compare equal. */
  private extractNumbers(text: string): string[] {
    return (text.match(/\d+(?:[.,]\d+)*/g) || []).map((n) => n.replace(/[.,]/g, ''));
  }

  /** Elements of `a` not matched one-for-one by elements of `b`. */
  private multisetDiff(a: string[], b: string[]): string[] {
    const counts = new Map<string, number>();
    for (const item of b) counts.set(item, (counts.get(item) || 0) + 1);
    const diff: string[] = [];
    for (const item of a) {
      const remaining = counts.get(item) || 0;
      if (remaining > 0) counts.set(item, remaining - 1);
      else diff.push(item);
    }
    return diff;
  }
}
