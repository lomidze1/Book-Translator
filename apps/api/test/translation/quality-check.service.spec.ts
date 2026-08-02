import { describe, it, expect, beforeEach } from 'vitest';
import { QualityCheckService } from '../../src/translation/quality-check.service';

describe('QualityCheckService', () => {
  let service: QualityCheckService;

  beforeEach(() => {
    service = new QualityCheckService();
  });

  describe('checkChapter', () => {
    it('should report no flags for a clean Georgian translation', () => {
      const source =
        'The morning was cold.\n\nJohn walked to the harbor and watched the ships.';
      const translated =
        'დილა ცივი იყო.\n\nჯონი ნავსადგურისკენ წავიდა და გემებს უყურებდა.';

      const report = service.checkChapter(source, translated);

      expect(report.flags).toEqual([]);
      expect(report.latinRatio).toBe(0);
    });

    it('should flag untranslated English leaking into the output', () => {
      const source =
        'The morning was cold. John walked to the harbor. The ships were waiting there. He thought about the journey ahead.';
      const translated =
        'დილა ცივი იყო. The ships were waiting there and nobody came to meet him at all. ის ფიქრობდა მომავალ მგზავრობაზე.';

      const report = service.checkChapter(source, translated);

      expect(report.flags).toContain('LATIN_LEAKAGE');
      expect(report.latinRatio).toBeGreaterThan(0.05);
      expect(report.latinSamples.length).toBeGreaterThan(0);
    });

    it('should NOT flag a single Latin proper noun or acronym', () => {
      const source = 'He worked at NASA for ten years and loved it very much indeed.';
      const translated =
        'ის NASA-ში ათი წლის განმავლობაში მუშაობდა და ეს საქმე ძალიან უყვარდა მართლაც გულწრფელად.';

      const report = service.checkChapter(source, translated);

      expect(report.flags).not.toContain('LATIN_LEAKAGE');
    });

    it('should flag numbers missing from the translation', () => {
      const source = 'In 1847 he wrote 23 letters to his brother.';
      const translated = 'მან 1847 წელს წერილები მისწერა ძმას.'; // "23" dropped

      const report = service.checkChapter(source, translated);

      expect(report.flags).toContain('NUMBER_MISMATCH');
      expect(report.missingNumbers).toEqual(['23']);
    });

    it('should treat "1,000" and "1000" as the same number', () => {
      const source = 'The army counted 1,000 soldiers.';
      const translated = 'ჯარი 1000 ჯარისკაცს ითვლიდა.';

      const report = service.checkChapter(source, translated);

      expect(report.flags).not.toContain('NUMBER_MISMATCH');
      expect(report.missingNumbers).toEqual([]);
    });

    it('should record extra numbers without flagging them', () => {
      const source = 'He arrived at dawn.';
      const translated = 'ის გამთენიისას, 5 საათზე ჩამოვიდა.';

      const report = service.checkChapter(source, translated);

      expect(report.flags).not.toContain('NUMBER_MISMATCH');
      expect(report.extraNumbers).toEqual(['5']);
    });

    it('should flag a collapsed paragraph structure', () => {
      const paragraphsKa = Array(6)
        .fill('ქართული აბზაცი საკმარისი სიგრძის ტექსტით რომ რეალურს ჰგავდეს.')
        .join(' '); // all merged into ONE paragraph
      const source = Array(6)
        .fill('An English paragraph with enough words to look like real content.')
        .join('\n\n');

      const report = service.checkChapter(source, paragraphsKa);

      expect(report.flags).toContain('PARAGRAPH_MISMATCH');
      expect(report.sourceParagraphs).toBe(6);
      expect(report.translatedParagraphs).toBe(1);
    });

    it('should NOT flag small paragraph-count differences', () => {
      const source = Array(6).fill('An English paragraph here.').join('\n\n');
      const translated = Array(5).fill('ქართული აბზაცი აქ არის.').join('\n\n');

      const report = service.checkChapter(source, translated);

      expect(report.flags).not.toContain('PARAGRAPH_MISMATCH');
    });

    it('should NOT flag paragraph counts on very short texts', () => {
      const source = 'One paragraph.\n\nTwo paragraph.';
      const translated = 'ერთი აბზაცი. მეორე აბზაცი.';

      const report = service.checkChapter(source, translated);

      expect(report.flags).not.toContain('PARAGRAPH_MISMATCH');
    });

    it('should flag consecutive repeated paragraphs (generation loop)', () => {
      const source = 'A long source paragraph about the sea and the sailors on it.';
      const repeated = 'ზღვაზე მცურავი გემი ნელა მიდიოდა ჰორიზონტისკენ და ქრებოდა.';
      const translated = `${repeated}\n\n${repeated}\n\n${repeated}`;

      const report = service.checkChapter(source, translated);

      expect(report.flags).toContain('REPETITION');
      expect(report.repeatedParagraphs).toBe(2);
    });

    it('should flag empty or whitespace-only output', () => {
      const report = service.checkChapter('Some real source text here.', '   \n  ');

      expect(report.flags).toContain('EMPTY_OUTPUT');
    });
  });

  describe('summarize', () => {
    it('should aggregate flag counts across chapter reports', () => {
      const clean = service.checkChapter('Hello there my friend.', 'გამარჯობა ჩემო მეგობარო.');
      const missing = service.checkChapter('He wrote 23 letters.', 'მან წერილები დაწერა.');

      const summary = service.summarize([clean, missing]);

      expect(summary.chaptersChecked).toBe(2);
      expect(summary.chaptersFlagged).toBe(1);
      expect(summary.flagCounts.NUMBER_MISMATCH).toBe(1);
    });
  });
});
