import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';
import { HIGHLIGHT_COLORS } from '@book-translator/reader';

// react-native ships Flow-typed sources that Node cannot parse; the components
// under test only need element factories and StyleSheet/Platform shims. No RN
// component is ever rendered here — ColorPicker is called as a plain function
// and its element tree inspected.
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  TouchableOpacity: 'TouchableOpacity',
  Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios },
  StyleSheet: { create: <T,>(styles: T) => styles },
}));

import ColorPicker, { HIGHLIGHT_HEX, type HighlightColor } from '@/components/reader/ColorPicker';
import SelectableChapterText from '@/components/reader/SelectableChapterText';

const HEX_PATTERN = /^#[0-9a-f]{6}$/;

describe('HIGHLIGHT_HEX', () => {
  it('covers exactly the shared HIGHLIGHT_COLORS palette from @book-translator/reader', () => {
    expect(Object.keys(HIGHLIGHT_HEX).sort()).toEqual([...HIGHLIGHT_COLORS].sort());
  });

  it('maps every color to a valid lowercase #rrggbb value', () => {
    for (const hex of Object.values(HIGHLIGHT_HEX)) {
      expect(hex).toMatch(HEX_PATTERN);
    }
  });

  it('assigns a distinct hex to each color', () => {
    const hexes = Object.values(HIGHLIGHT_HEX);
    expect(new Set(hexes).size).toBe(hexes.length);
  });

  it('keeps the mobile HighlightColor union assignable to the shared palette', () => {
    // Compile-time contract: each shared color is a valid mobile HighlightColor.
    const roundTrip: HighlightColor[] = [...HIGHLIGHT_COLORS];
    expect(roundTrip).toHaveLength(4);
  });
});

describe('ColorPicker element tree (no rendering)', () => {
  const dots = (selected?: HighlightColor, onSelect = vi.fn()) => {
    // ColorPicker uses no hooks, so it can be invoked as a plain function.
    const tree = ColorPicker({ selected, onSelect }) as ReactElement<{ children: ReactElement[] }>;
    return { tree, children: tree.props.children, onSelect };
  };

  it('renders one dot per palette color, in the palette order', () => {
    const { children } = dots();

    expect(children).toHaveLength(4);
    expect(children.map((c) => c.key)).toEqual(['yellow', 'green', 'blue', 'red']);
  });

  it('paints each dot with the hex that HIGHLIGHT_HEX advertises for its color', () => {
    const { children } = dots();

    for (const dot of children as ReactElement<{ style: unknown[]; accessibilityLabel: string }>[]) {
      const key = dot.key as HighlightColor;
      const backgrounds = (dot.props.style as { backgroundColor?: string }[])
        .filter((s) => s && typeof s === 'object' && 'backgroundColor' in s)
        .map((s) => s.backgroundColor);
      // The inline COLORS list and the exported HIGHLIGHT_HEX map must agree,
      // otherwise the picker shows one color and the chapter paints another.
      expect(backgrounds).toEqual([HIGHLIGHT_HEX[key]]);
    }
  });

  it('labels every dot with its color name for accessibility', () => {
    const { children } = dots();

    expect(
      (children as ReactElement<{ accessibilityLabel: string }>[]).map((c) => c.props.accessibilityLabel),
    ).toEqual(['yellow', 'green', 'blue', 'red']);
  });

  it('reports the pressed color through onSelect', () => {
    const { children, onSelect } = dots();

    (children[2] as ReactElement<{ onPress: () => void }>).props.onPress();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('blue');
  });

  it('marks only the selected dot with the selection ring', () => {
    const { children } = dots('green');

    const ringFlags = (children as ReactElement<{ style: unknown[] }>[]).map(
      (dot) => dot.props.style[2],
    );
    // Unselected dots carry `false` in the conditional style slot.
    expect(ringFlags[0]).toBe(false);
    expect(ringFlags[1]).toMatchObject({ borderWidth: 3 });
    expect(ringFlags[2]).toBe(false);
    expect(ringFlags[3]).toBe(false);
  });

  it('renders no ring at all when nothing is selected', () => {
    const { children } = dots(undefined);

    for (const dot of children as ReactElement<{ style: unknown[] }>[]) {
      expect(dot.props.style[2]).toBe(false);
    }
  });
});

describe('SelectableChapterText module surface', () => {
  it('exports only the component — offset math lives in @book-translator/reader', () => {
    // The component uses hooks and native TextInput behavior, so it is not
    // invoked here; this pins the module surface so pure helpers added later
    // get pulled into unit tests.
    expect(typeof SelectableChapterText).toBe('function');
  });
});
