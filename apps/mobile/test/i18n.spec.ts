import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';
import en from '@/i18n/locales/en.json';
import ka from '@/i18n/locales/ka.json';

/** Flattens a locale tree into "a.b.c" → value pairs. */
function flatten(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      for (const [childPath, childValue] of flatten(value as Record<string, unknown>, path)) {
        out.set(childPath, childValue);
      }
    } else {
      out.set(path, String(value));
    }
  }
  return out;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
}

const enFlat = flatten(en);
const kaFlat = flatten(ka);

describe('locale key parity', () => {
  it('has every en key present in ka', () => {
    const missing = [...enFlat.keys()].filter((k) => !kaFlat.has(k));
    expect(missing, `keys missing from ka.json: ${missing.join(', ')}`).toEqual([]);
  });

  it('has every ka key present in en', () => {
    const missing = [...kaFlat.keys()].filter((k) => !enFlat.has(k));
    expect(missing, `keys missing from en.json: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('locale values', () => {
  it('has no empty values in en', () => {
    const empty = [...enFlat.entries()].filter(([, v]) => v.trim() === '').map(([k]) => k);
    expect(empty, `empty values in en.json: ${empty.join(', ')}`).toEqual([]);
  });

  it('has no empty values in ka', () => {
    const empty = [...kaFlat.entries()].filter(([, v]) => v.trim() === '').map(([k]) => k);
    expect(empty, `empty values in ka.json: ${empty.join(', ')}`).toEqual([]);
  });

  it('uses matching interpolation placeholders in both locales', () => {
    const mismatched: string[] = [];
    for (const [key, enValue] of enFlat) {
      const kaValue = kaFlat.get(key);
      if (kaValue === undefined) continue; // parity covered above
      const enPh = placeholders(enValue);
      const kaPh = placeholders(kaValue);
      if (enPh.join(',') !== kaPh.join(',')) {
        mismatched.push(`${key} (en: [${enPh}] vs ka: [${kaPh}])`);
      }
    }
    expect(mismatched, `placeholder mismatches: ${mismatched.join('; ')}`).toEqual([]);
  });
});

describe('i18n instance', () => {
  it('defaults to Georgian with fallback enabled', () => {
    expect(i18n.defaultLocale).toBe('ka');
    expect(i18n.locale).toBe('ka');
    expect(i18n.enableFallback).toBe(true);
  });

  it('translates a real key in both locales', () => {
    const [sampleKey] = [...enFlat.keys()];

    expect(i18n.t(sampleKey, { locale: 'ka' })).toBe(kaFlat.get(sampleKey));
    expect(i18n.t(sampleKey, { locale: 'en' })).toBe(enFlat.get(sampleKey));
  });
});
