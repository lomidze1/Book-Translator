'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  useReaderSettings,
  useReadingProgress,
  useBookmarks,
  useHighlights,
  useNotes,
  FONT_FAMILIES,
  type HighlightColor,
  type Bookmark,
  type Highlight,
  type ReaderNote,
} from '@book-translator/reader';
import ReaderToolbar from './components/ReaderToolbar';
import ReaderSidebar, { type SearchResult } from './components/ReaderSidebar';
import TextSelectionPopup from './components/TextSelectionPopup';
import NoteEditor from './components/NoteEditor';
import TtsGenerationPanel from './components/TtsGenerationPanel';
import AudioPlayer from './components/AudioPlayer';
import { TTS_ENABLED } from '@/lib/features';
import styles from './reader.module.scss';
import { API_URL } from '@/lib/api-client';


interface TranslatedChapter {
  id: string;
  translatedContent: string;
  chapter: { number: number; title?: string };
}

interface TranslationData {
  id: string;
  status: string;
  book: { id: string; title: string; author?: string };
  translatedChapters: TranslatedChapter[];
}

interface Props {
  translation: TranslationData;
  token: string;
}

// A renderable paragraph with its character offset inside the chapter text,
// so highlight positions stay chapter-global and paragraph rendering stays local.
interface Paragraph {
  text: string;
  start: number;
  splitIndex: number;
}

interface NoteEditorState {
  chapterNumber: number;
  noteId?: string;
  initialContent?: string;
  highlightId?: string;
  /** Highlight created just for this note — removed again if the note is cancelled. */
  createdHighlightId?: string;
}

const SEARCH_MAX_RESULTS = 100;
const SEARCH_MIN_CHARS = 2;

/** Text offset of a (container, offset) DOM boundary within `root`. */
function textOffsetWithin(root: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(container, offset);
  return range.toString().length;
}

export default function ReaderView({ translation, token }: Props) {
  const t = useTranslations('reader');
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  const bookId = translation.book.id;

  // Shared hooks
  const { settings, setSettings } = useReaderSettings();
  const { progress, updateProgress } = useReadingProgress(bookId, token);
  const { bookmarks, addBookmark, removeBookmark } = useBookmarks(bookId, token);
  const { highlights, addHighlight, removeHighlight } = useHighlights(bookId, token);
  const { notes, addNote, updateNote, removeNote } = useNotes(bookId, token);

  // Local UI state.
  // Sidebar defaults open on desktop, closed on mobile (≤768px) where it
  // otherwise slides in over the content on first render. Reading the
  // viewport width on the initial render is safe under React 19 — the
  // `useState` initializer only runs once on the client; SSR sees true,
  // which is the desktop default, and hydration matches once the client
  // re-evaluates the layout effect below.
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      setSidebarOpen(false);
    }
  }, []);
  const [activeChapter, setActiveChapter] = useState(1);
  const [percentage, setPercentage] = useState(0);
  const [selectionPopup, setSelectionPopup] = useState<{ x: number; y: number; text: string; chapterNumber: number; start: number; end: number } | null>(null);
  const [noteEditor, setNoteEditor] = useState<NoteEditorState | null>(null);
  const [flashParagraph, setFlashParagraph] = useState<string | null>(null);
  // Paginated mode state
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageStepRef = useRef(0);
  // TTS state
  const [audioBookId, setAudioBookId] = useState<string | null>(null);
  const [audioChapters, setAudioChapters] = useState<Array<{ audioChapterId: string; chapterNumber: number; duration: number | null; status: string }>>([]);
  const [showTtsPanel, setShowTtsPanel] = useState(false);

  const chapters = useMemo(
    () => [...translation.translatedChapters].sort((a, b) => a.chapter.number - b.chapter.number),
    [translation.translatedChapters]
  );

  // Paragraphs per chapter with chapter-global character offsets
  const chapterParagraphs = useMemo(() => {
    const map = new Map<number, Paragraph[]>();
    for (const ch of chapters) {
      const parts = ch.translatedContent.split('\n');
      const paragraphs: Paragraph[] = [];
      let offset = 0;
      parts.forEach((part, splitIndex) => {
        if (part.trim()) paragraphs.push({ text: part, start: offset, splitIndex });
        offset += part.length + 1; // +1 for the newline consumed by split
      });
      map.set(ch.chapter.number, paragraphs);
    }
    return map;
  }, [chapters]);

  const chapterTexts = useMemo(() => {
    const map = new Map<number, string>();
    for (const ch of chapters) map.set(ch.chapter.number, ch.translatedContent);
    return map;
  }, [chapters]);

  // Resolve stored highlights to chapter-global ranges. Positions are
  // authoritative when they still match the text; otherwise fall back to
  // first-occurrence search (covers rows saved before positions were real).
  const resolvedHighlights = useMemo(() => {
    const map = new Map<number, { start: number; end: number; color: string }[]>();
    for (const hl of highlights) {
      const chapterText = chapterTexts.get(hl.chapterNumber);
      if (!chapterText) continue;
      let { startPosition: start, endPosition: end } = hl;
      if (chapterText.slice(start, end) !== hl.selectedText) {
        const idx = chapterText.indexOf(hl.selectedText);
        if (idx === -1) continue;
        start = idx;
        end = idx + hl.selectedText.length;
      }
      const list = map.get(hl.chapterNumber) || [];
      list.push({ start, end, color: hl.color });
      map.set(hl.chapterNumber, list);
    }
    return map;
  }, [highlights, chapterTexts]);

  // Load existing audio chapters on mount
  useEffect(() => {
    if (!TTS_ENABLED) return;
    async function loadAudioChapters() {
      try {
        const res = await fetch(`${API_URL}/api/tts/chapters/${bookId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.length > 0) {
            setAudioChapters(data);
          }
        }
      } catch {
        // Audio not available — that's OK
      }
    }
    loadAudioChapters();
  }, [bookId, token]);

  const handleAudioReady = useCallback((newAudioBookId: string) => {
    setAudioBookId(newAudioBookId);
    setShowTtsPanel(false);
    // Reload audio chapters
    fetch(`${API_URL}/api/tts/chapters/${bookId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setAudioChapters(data))
      .catch(() => {});
  }, [bookId, token]);

  const getStreamUrl = useCallback(async (audioChapterId: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API_URL}/api/tts/stream/${audioChapterId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const url = await res.text();
        return url.startsWith('"') ? JSON.parse(url) : url;
      }
    } catch {
      // ignore
    }
    return null;
  }, [token]);

  // Resume from saved position — once, restoring the exact scroll offset
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !progress || !contentRef.current) return;
    restoredRef.current = true;
    setActiveChapter(progress.currentChapter);
    if (progress.currentPosition > 0) {
      contentRef.current.scrollTop = progress.currentPosition;
      if (!settings.scrollMode && pageStepRef.current > 0) {
        setCurrentPage(Math.round(progress.currentPosition / pageStepRef.current));
      }
    } else {
      document.getElementById(`chapter-${progress.currentChapter}`)?.scrollIntoView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  // Track scroll position and update progress
  const handleScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;

    const scrollTop = el.scrollTop;
    const scrollHeight = el.scrollHeight - el.clientHeight;
    const pct = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;
    setPercentage(pct);

    // Determine active chapter
    const chapterEls = el.querySelectorAll('[data-chapter]');
    let current = 1;
    chapterEls.forEach((chEl) => {
      const rect = chEl.getBoundingClientRect();
      const containerRect = el.getBoundingClientRect();
      if (rect.top <= containerRect.top + 100) {
        current = parseInt(chEl.getAttribute('data-chapter') || '1');
      }
    });
    setActiveChapter(current);
    updateProgress(current, Math.round(scrollTop), pct);
  }, [updateProgress]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Handle text selection — compute real chapter-global character offsets
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setSelectionPopup(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const startP = (range.startContainer.parentElement || (range.startContainer as HTMLElement))?.closest?.('p[data-para-start]') as HTMLElement | null;
    const endP = (range.endContainer.parentElement || (range.endContainer as HTMLElement))?.closest?.('p[data-para-start]') as HTMLElement | null;
    if (!startP || !endP) {
      setSelectionPopup(null);
      return;
    }

    const startChapterEl = startP.closest('[data-chapter]');
    const endChapterEl = endP.closest('[data-chapter]');
    const chapterNumber = parseInt(startChapterEl?.getAttribute('data-chapter') || '1');
    // Cross-chapter selections can't be stored as one range — ignore them
    if (startChapterEl !== endChapterEl) {
      setSelectionPopup(null);
      return;
    }

    const start = parseInt(startP.dataset.paraStart || '0') + textOffsetWithin(startP, range.startContainer, range.startOffset);
    const end = parseInt(endP.dataset.paraStart || '0') + textOffsetWithin(endP, range.endContainer, range.endOffset);
    if (end <= start) {
      setSelectionPopup(null);
      return;
    }

    const chapterText = chapterTexts.get(chapterNumber) || '';

    setSelectionPopup({
      x: rect.left + rect.width / 2 - 100,
      y: rect.top - 50,
      // Slice from the source text so the stored selection matches positions exactly
      text: chapterText.slice(start, end),
      chapterNumber,
      start,
      end,
    });
  }, [chapterTexts]);

  // Scroll to chapter
  const scrollToChapter = (num: number) => {
    const el = document.getElementById(`chapter-${num}`);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    setActiveChapter(num);
  };

  // Scroll to a specific paragraph and flash it (search results, annotations)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToParagraph = useCallback((chapterNumber: number, splitIndex: number) => {
    const key = `${chapterNumber}-${splitIndex}`;
    const el = document.getElementById(`ch-${chapterNumber}-p-${splitIndex}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setActiveChapter(chapterNumber);
      setFlashParagraph(key);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashParagraph(null), 2000);
    } else {
      scrollToChapter(chapterNumber);
    }
  }, []);

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  // Find the paragraph containing a chapter-global character offset
  const paragraphAtOffset = useCallback((chapterNumber: number, offset: number): Paragraph | null => {
    const paragraphs = chapterParagraphs.get(chapterNumber) || [];
    return paragraphs.find((p) => offset >= p.start && offset < p.start + p.text.length + 1) || paragraphs[0] || null;
  }, [chapterParagraphs]);

  const jumpToHighlight = useCallback((hl: Highlight) => {
    const chapterText = chapterTexts.get(hl.chapterNumber) || '';
    let start = hl.startPosition;
    if (chapterText.slice(hl.startPosition, hl.endPosition) !== hl.selectedText) {
      const idx = chapterText.indexOf(hl.selectedText);
      start = idx === -1 ? 0 : idx;
    }
    const para = paragraphAtOffset(hl.chapterNumber, start);
    if (para) scrollToParagraph(hl.chapterNumber, para.splitIndex);
    else scrollToChapter(hl.chapterNumber);
  }, [chapterTexts, paragraphAtOffset, scrollToParagraph]);

  // In-book search
  const searchBook = useCallback((query: string): SearchResult[] => {
    const q = query.trim().toLowerCase();
    if (q.length < SEARCH_MIN_CHARS) return [];
    const results: SearchResult[] = [];
    for (const ch of chapters) {
      const paragraphs = chapterParagraphs.get(ch.chapter.number) || [];
      for (const para of paragraphs) {
        const lower = para.text.toLowerCase();
        let idx = lower.indexOf(q);
        while (idx !== -1) {
          const snippetStart = Math.max(0, idx - 40);
          const snippetEnd = Math.min(para.text.length, idx + q.length + 40);
          results.push({
            chapterNumber: ch.chapter.number,
            splitIndex: para.splitIndex,
            snippet:
              (snippetStart > 0 ? '…' : '') +
              para.text.slice(snippetStart, snippetEnd) +
              (snippetEnd < para.text.length ? '…' : ''),
          });
          if (results.length >= SEARCH_MAX_RESULTS) return results;
          idx = lower.indexOf(q, idx + q.length);
        }
      }
    }
    return results;
  }, [chapters, chapterParagraphs]);

  // Bookmark current position
  const currentBookmark = bookmarks.find(
    (b) => b.chapterNumber === activeChapter
  );

  const toggleBookmark = async () => {
    if (currentBookmark) {
      await removeBookmark(currentBookmark.id);
    } else {
      const scrollTop = contentRef.current?.scrollTop || 0;
      await addBookmark(activeChapter, Math.round(scrollTop));
    }
  };

  // Highlight selected text
  const handleHighlight = async (color: HighlightColor) => {
    if (!selectionPopup) return;
    await addHighlight({
      chapterNumber: selectionPopup.chapterNumber,
      startPosition: selectionPopup.start,
      endPosition: selectionPopup.end,
      selectedText: selectionPopup.text,
      color,
    });
    window.getSelection()?.removeAllRanges();
    setSelectionPopup(null);
  };

  // Copy text
  const handleCopy = () => {
    if (selectionPopup?.text) {
      navigator.clipboard.writeText(selectionPopup.text);
    }
    setSelectionPopup(null);
  };

  // Note flow — a note created from a selection is anchored to a highlight
  const handleAddNoteFromSelection = async () => {
    if (!selectionPopup) return;
    const { chapterNumber, start, end, text } = selectionPopup;
    window.getSelection()?.removeAllRanges();
    setSelectionPopup(null);
    try {
      const hl = await addHighlight({
        chapterNumber,
        startPosition: start,
        endPosition: end,
        selectedText: text,
        color: 'yellow',
      });
      setNoteEditor({ chapterNumber, highlightId: hl?.id, createdHighlightId: hl?.id });
    } catch {
      setNoteEditor({ chapterNumber });
    }
  };

  const handleEditNote = (note: ReaderNote) => {
    setNoteEditor({
      chapterNumber: note.chapterNumber,
      noteId: note.id,
      initialContent: note.content,
    });
  };

  const handleSaveNote = async (content: string) => {
    if (!noteEditor) return;
    if (noteEditor.noteId) {
      await updateNote(noteEditor.noteId, content);
    } else {
      await addNote({
        chapterNumber: noteEditor.chapterNumber,
        content,
        highlightId: noteEditor.highlightId,
      });
    }
    setNoteEditor(null);
  };

  const handleCancelNote = () => {
    // Remove the highlight that existed only to anchor this cancelled note
    if (noteEditor?.createdHighlightId) {
      removeHighlight(noteEditor.createdHighlightId).catch(() => {});
    }
    setNoteEditor(null);
  };

  // Render a paragraph with highlights applied via chapter-global positions
  const renderWithHighlights = useCallback((para: Paragraph, chapterNumber: number) => {
    const ranges = resolvedHighlights.get(chapterNumber);
    if (!ranges || ranges.length === 0) return para.text;

    const paraEnd = para.start + para.text.length;
    const matches = ranges
      .filter((r) => r.start < paraEnd && r.end > para.start)
      .map((r) => ({
        start: Math.max(0, r.start - para.start),
        end: Math.min(para.text.length, r.end - para.start),
        color: r.color,
      }))
      .sort((a, b) => a.start - b.start);

    if (matches.length === 0) return para.text;

    const text = para.text;
    const parts: React.ReactNode[] = [];
    let lastEnd = 0;

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      if (m.start < lastEnd) continue;

      if (m.start > lastEnd) {
        parts.push(text.slice(lastEnd, m.start));
      }

      const colorClass =
        m.color === 'yellow' ? styles.highlightYellow :
        m.color === 'green' ? styles.highlightGreen :
        m.color === 'blue' ? styles.highlightBlue :
        m.color === 'red' ? styles.highlightRed : '';

      parts.push(
        <span key={`hl-${i}`} className={`${styles.highlightSpan} ${colorClass}`}>
          {text.slice(m.start, m.end)}
        </span>
      );
      lastEnd = m.end;
    }

    if (lastEnd < text.length) {
      parts.push(text.slice(lastEnd));
    }

    return <>{parts}</>;
  }, [resolvedHighlights]);

  // Paginated mode: page step snaps to whole lines so text isn't clipped mid-line
  const totalPagesRef = useRef(1);

  const computePages = useCallback(() => {
    const el = contentRef.current;
    if (settings.scrollMode || !el) return;
    const lineHeightPx = settings.fontSize * settings.lineHeight;
    const step = Math.max(lineHeightPx, Math.floor(el.clientHeight / lineHeightPx) * lineHeightPx);
    pageStepRef.current = step;
    const total = Math.max(1, Math.ceil(el.scrollHeight / step));
    totalPagesRef.current = total;
    setTotalPages(total);
  }, [settings.scrollMode, settings.fontSize, settings.lineHeight]);

  useEffect(() => {
    computePages();
  }, [computePages, chapters]);

  const goToPage = useCallback((page: number) => {
    if (!contentRef.current || pageStepRef.current <= 0) return;
    const total = totalPagesRef.current;
    const clamped = Math.max(0, Math.min(page, total - 1));
    setCurrentPage(clamped);
    contentRef.current.scrollTop = clamped * pageStepRef.current;
    setPercentage(total > 1 ? Math.round((clamped / (total - 1)) * 100) : 0);
  }, []);

  // Keep the page map in sync with viewport size
  const currentPageRef = useRef(0);
  currentPageRef.current = currentPage;
  useEffect(() => {
    if (settings.scrollMode) return;
    const onResize = () => {
      computePages();
      goToPage(currentPageRef.current);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [settings.scrollMode, computePages, goToPage]);

  // Handle keyboard for paginated mode
  useEffect(() => {
    if (settings.scrollMode) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        goToPage(currentPage + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToPage(currentPage - 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [settings.scrollMode, currentPage, goToPage]);

  // Apply CSS custom properties for reader settings
  const contentStyle: React.CSSProperties = {
    '--reader-font-size': `${settings.fontSize}px`,
    '--reader-line-height': String(settings.lineHeight),
    '--reader-font-family': FONT_FAMILIES[settings.fontFamily],
  } as React.CSSProperties;

  return (
    <div className={styles.readerWrapper} data-reader-theme={settings.theme}>
      <ReaderToolbar
        title={translation.book.title}
        settings={settings}
        onSettingsChange={setSettings}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onBack={() => router.back()}
        isBookmarked={!!currentBookmark}
        onToggleBookmark={toggleBookmark}
      />

      <div className={styles.readerLayout}>
        <ReaderSidebar
          chapters={chapters.map((c) => ({ number: c.chapter.number, title: c.chapter.title }))}
          activeChapter={activeChapter}
          bookmarks={bookmarks}
          highlights={highlights}
          notes={notes}
          open={sidebarOpen}
          onChapterClick={scrollToChapter}
          onBookmarkClick={(bm: Bookmark) => scrollToChapter(bm.chapterNumber)}
          onHighlightClick={jumpToHighlight}
          onNoteClick={(n: ReaderNote) => scrollToChapter(n.chapterNumber)}
          onEditNote={handleEditNote}
          onDeleteBookmark={(id: string) => removeBookmark(id)}
          onDeleteHighlight={(id: string) => removeHighlight(id)}
          onDeleteNote={(id: string) => removeNote(id)}
          onSearch={searchBook}
          onSearchResultClick={(r: SearchResult) => scrollToParagraph(r.chapterNumber, r.splitIndex)}
          onClose={() => setSidebarOpen(false)}
        />

        <div
          ref={contentRef}
          className={`${styles.contentArea} ${!settings.scrollMode ? styles.paginatedMode : ''}`}
          onMouseUp={handleMouseUp}
        >
          <div className={styles.contentInner} style={contentStyle}>
            {chapters.map((ch) => (
              <article
                key={ch.id}
                id={`chapter-${ch.chapter.number}`}
                data-chapter={ch.chapter.number}
                className={styles.chapter}
              >
                <h2>{ch.chapter.title || t('chapter', { number: ch.chapter.number })}</h2>
                <div className={styles.chapterText}>
                  {(chapterParagraphs.get(ch.chapter.number) || []).map((para) => (
                    <p
                      key={para.splitIndex}
                      id={`ch-${ch.chapter.number}-p-${para.splitIndex}`}
                      data-para-start={para.start}
                      className={flashParagraph === `${ch.chapter.number}-${para.splitIndex}` ? styles.searchFlash : undefined}
                    >
                      {renderWithHighlights(para, ch.chapter.number)}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      {/* Selection Popup */}
      {selectionPopup && (
        <TextSelectionPopup
          position={{ x: selectionPopup.x, y: selectionPopup.y }}
          onHighlight={handleHighlight}
          onAddNote={handleAddNoteFromSelection}
          onCopy={handleCopy}
          onClose={() => setSelectionPopup(null)}
        />
      )}

      {/* Note Editor */}
      {noteEditor && (
        <NoteEditor
          initialContent={noteEditor.initialContent}
          onSave={handleSaveNote}
          onCancel={handleCancelNote}
        />
      )}

      {/* Paginated Navigation */}
      {!settings.scrollMode && (
        <div className={styles.pageNavigation}>
          <button
            className={styles.pageNavBtn}
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 0}
            aria-label={t('previous_page')}
          >
            &#8592;
          </button>
          <span className={styles.pageInfo}>
            {currentPage + 1} / {totalPages}
          </span>
          <button
            className={styles.pageNavBtn}
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages - 1}
            aria-label={t('next_page')}
          >
            &#8594;
          </button>
        </div>
      )}

      {/* TTS Generation Panel */}
      {TTS_ENABLED && showTtsPanel && (
        <div className={styles.ttsSidePanel}>
          <TtsGenerationPanel
            bookId={bookId}
            apiUrl={API_URL}
            token={token}
            onAudioReady={handleAudioReady}
          />
          <button
            className={styles.ttsClosePanelBtn}
            onClick={() => setShowTtsPanel(false)}
          >
            &times;
          </button>
        </div>
      )}

      {/* TTS toggle button */}
      {TTS_ENABLED && !showTtsPanel && audioChapters.length === 0 && (
        <button
          className={styles.ttsFloatingBtn}
          onClick={() => setShowTtsPanel(true)}
          title={t('tts_generate')}
          aria-label={t('tts_generate')}
        >
          🔊
        </button>
      )}

      {/* Audio Player */}
      {audioChapters.length > 0 && (
        <AudioPlayer
          chapters={audioChapters}
          currentChapter={activeChapter}
          onChapterChange={(ch) => scrollToChapter(ch)}
          getStreamUrl={getStreamUrl}
          bookTitle={translation.book.title || ''}
        />
      )}

      {/* Progress Bar */}
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${percentage}%` }} />
      </div>
      <div className={styles.progressLabel}>
        {settings.scrollMode
          ? t('progress', { percentage })
          : `${currentPage + 1} / ${totalPages}`
        }
      </div>
    </div>
  );
}
