export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'red'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];
