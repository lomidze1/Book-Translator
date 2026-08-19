import { describe, it, expect } from 'vitest';
import { colors } from '@/theme/colors';

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGBA_COLOR = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/;

describe('theme palettes', () => {
  it('defines both light and dark palettes', () => {
    expect(colors.light).toBeDefined();
    expect(colors.dark).toBeDefined();
  });

  it('defines the same set of keys in light and dark', () => {
    expect(Object.keys(colors.dark).sort()).toEqual(Object.keys(colors.light).sort());
  });

  it.each(Object.entries(colors))('has only valid color values in the %s palette', (_name, palette) => {
    for (const [key, value] of Object.entries(palette)) {
      const valid = HEX_COLOR.test(value) || RGBA_COLOR.test(value);
      expect(valid, `${key} has invalid color value: ${value}`).toBe(true);
    }
  });
});
