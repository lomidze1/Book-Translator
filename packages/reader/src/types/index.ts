export interface ReaderSettings {
  fontSize: number;
  fontFamily: 'default' | 'serif' | 'sans-serif' | 'bpg';
  lineHeight: number;
  theme: 'light' | 'dark' | 'sepia';
  scrollMode: boolean;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 18,
  fontFamily: 'default',
  lineHeight: 1.8,
  theme: 'light',
  scrollMode: true,
};

export interface ReadingPosition {
  id: string;
  bookId: string;
  currentChapter: number;
  currentPosition: number;
  percentage: number;
  lastReadAt: string;
}

export interface Bookmark {
  id: string;
  bookId: string;
  chapterNumber: number;
  position: number;
  label?: string;
  createdAt: string;
}

export interface Highlight {
  id: string;
  bookId: string;
  chapterNumber: number;
  startPosition: number;
  endPosition: number;
  color: string;
  selectedText: string;
  notes?: ReaderNote[];
  createdAt: string;
}

export interface ReaderNote {
  id: string;
  bookId: string;
  chapterNumber: number;
  highlightId?: string;
  highlight?: Highlight;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'red';

export const HIGHLIGHT_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'red'];

export const FONT_FAMILIES: Record<ReaderSettings['fontFamily'], string> = {
  default: '"Noto Serif Georgian", Georgia, serif',
  serif: '"Noto Serif Georgian", Georgia, serif',
  'sans-serif': '"FiraGO", "Noto Sans Georgian", Arial, sans-serif',
  bpg: '"BPG Glaho", Georgia, serif',
};

export const FONT_SIZE_RANGE = { min: 14, max: 28, step: 2 };
export const LINE_HEIGHT_RANGE = { min: 1.4, max: 2.2, step: 0.2 };
