/**
 * Golden-set quality run: translate the fixed public-domain samples in
 * test/golden/samples/, run the mechanical checks and the Gemini judge on
 * each, and save a timestamped results file for comparison across prompt or
 * pipeline changes.
 *
 * Usage:  pnpm quality:golden        (requires ANTHROPIC_API_KEY; the judge
 *                                     step also needs GEMINI_API_KEY)
 */
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { ClaudeService } from '../src/translation/claude.service';
import { GeminiJudgeService } from '../src/translation/gemini-judge.service';
import { QualityCheckService } from '../src/translation/quality-check.service';

try {
  process.loadEnvFile(path.join(__dirname, '../.env'));
} catch {
  // no .env — rely on the ambient environment
}

async function main() {
  const config = new ConfigService();
  const claude = new ClaudeService(config);
  claude.onModuleInit();
  const judge = new GeminiJudgeService(config);
  judge.onModuleInit();
  const qualityCheck = new QualityCheckService();

  const samplesDir = path.join(__dirname, '../test/golden/samples');
  const files = fs
    .readdirSync(samplesDir)
    .filter((f) => f.endsWith('.txt'))
    .sort();
  if (files.length === 0) {
    console.error(`No .txt samples found in ${samplesDir}`);
    process.exit(1);
  }
  if (!judge.isEnabled()) {
    console.warn('GEMINI_API_KEY not set — running without the judge (mechanical checks only)\n');
  }

  const results: Array<Record<string, unknown>> = [];

  for (const file of files) {
    const source = fs.readFileSync(path.join(samplesDir, file), 'utf-8').trim();
    console.log(`\n=== ${file} (${source.length} chars) ===`);

    const started = Date.now();
    // Mirror the real pipeline: brief first, then translate against it.
    const { styleGuide } = await claude.generateStyleGuide([source], file);
    const { translatedText, tokensUsed } = await claude.translateChapter(source, {
      bookTitle: 'Golden Set',
      chapterNumber: 1,
      totalChapters: 1,
      styleGuide,
      editorPass: true,
    });
    const seconds = Math.round((Date.now() - started) / 100) / 10;

    const mechanical = qualityCheck.checkChapter(source, translatedText);
    const scores = await judge.judgeSample(source, translatedText);

    console.log(translatedText.split('\n')[0].slice(0, 120) + '…');
    console.log(`tokens=${tokensUsed}  time=${seconds}s  flags=[${mechanical.flags.join(', ')}]`);
    if (scores) {
      console.log(
        `judge: accuracy=${scores.accuracy}  fluency=${scores.fluency}  consistency=${scores.consistency}  overall=${scores.overall}`,
      );
      for (const issue of scores.issues) {
        console.log(`  - [${issue.type}] ${issue.quote ?? ''} ${issue.note ?? ''}`.trimEnd());
      }
    }

    results.push({ file, tokensUsed, seconds, styleGuide, mechanical, judge: scores, translatedText });
  }

  const outDir = path.join(__dirname, '../test/golden/results');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ model: claude.getModel(), results }, null, 2));
  console.log(`\nSaved: ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
