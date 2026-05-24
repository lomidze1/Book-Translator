'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
import ReaderSidebar from './components/ReaderSidebar';
import TextSelectionPopup from './components/TextSelectionPopup';
import NoteEditor from './components/NoteEditor';
import TtsGenerationPanel from './components/TtsGenerationPanel';
import AudioPlayer from './components/AudioPlayer';
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

export default function ReaderView({ translation, token }: Props) {
  const t = useTranslations('reader');
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  const bookId = translation.book.id;

  // Shared hooks
  const { settings, setSettings } = useReaderSettings();
  const { progress, updateProgress } = useReadingProgress(bookId, token);
  const { bookmarks, addBookmark, removeBookmark } = useBookmarks(bookId, token);
  const { highlights, addHighlight, updateColor, removeHighlight } = useHighlights(bookId, token);
  const { notes, addNote, removeNote } = useNotes(bookId, token);

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
  const [noteEditor, setNoteEditor] = useState<{ chapterNumber: number; highlightId?: string } | null>(null);
  // Paginated mode state
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  // TTS state
  const [audioBookId, setAudioBookId] = useState<string | null>(null);
  const [audioChapters, setAudioChapters] = useState<Array<{ audioChapterId: string; chapterNumber: number; duration: number | null; status: string }>>([]);
  const [showTtsPanel, setShowTtsPanel] = useState(false);

  const chapters = [...translation.translatedChapters].sort(
    (a, b) => a.chapter.number - b.chapter.number
  );

  // Load existing audio chapters on mount
  useEffect(() => {
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

  // Resume from saved position
  useEffect(() => {
    if (progress && contentRef.current) {
      const el = document.getElementById(`chapter-${progress.currentChapter}`);
      if (el) {
        el.scrollIntoView();
        setActiveChapter(progress.currentChapter);
      }
    }
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

  // Handle text selection
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setSelectionPopup(null);
      return;
    }

    const text = selection.toString().trim();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Find parent chapter
    let chapterEl = range.startContainer.parentElement;
    while (chapterEl && !chapterEl.hasAttribute('data-chapter')) {
      chapterEl = chapterEl.parentElement;
    }
    const chapterNumber = chapterEl ? parseInt(chapterEl.getAttribute('data-chapter') || '1') : activeChapter;

    setSelectionPopup({
      x: rect.left + rect.width / 2 - 100,
      y: rect.top - 50,
      text,
      chapterNumber,
      start: 0,
      end: text.length,
    });
  }, [activeChapter]);

  // Scroll to chapter
  const scrollToChapter = (num: number) => {
    const el = document.getElementById(`chapter-${num}`);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    setActiveChapter(num);
  };

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

  // Note flow
  const handleAddNoteFromSelection = () => {
    if (!selectionPopup) return;
    setNoteEditor({ chapterNumber: selectionPopup.chapterNumber });
    setSelectionPopup(null);
  };

  const handleSaveNote = async (content: string) => {
    if (!noteEditor) return;
    await addNote({
      chapterNumber: noteEditor.chapterNumber,
      content,
      highlightId: noteEditor.highlightId,
    });
    setNoteEditor(null);
  };

  // Render chapter text with highlights applied
  // Uses text-search matching: finds selectedText within each paragraph
  const renderWithHighlights = useCallback((text: string, chapterNumber: number) => {
    const chapterHighlights = highlights.filter(h => h.chapterNumber === chapterNumber);
    if (chapterHighlights.length === 0) return text;

    // Find highlights that match text in this paragraph
    const matches: { start: number; end: number; color: string }[] = [];
    for (const hl of chapterHighlights) {
      // Only match single-paragraph highlights (no newlines in selectedText)
      if (hl.selectedText.includes('\n')) continue;

      let searchFrom = 0;
      // Find first occurrence in this paragraph
      const idx = text.indexOf(hl.selectedText, searchFrom);
      if (idx !== -1) {
        matches.push({ start: idx, end: idx + hl.selectedText.length, color: hl.color });
      }
    }

    if (matches.length === 0) return text;

    // Sort by start position
    matches.sort((a, b) => a.start - b.start);

    // Build React elements, skip overlapping matches
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
  }, [highlights]);

  // Paginated mode: calculate pages based on content height
  useEffect(() => {
    if (settings.scrollMode || !contentRef.current) return;
    const el = contentRef.current;
    const pageHeight = el.clientHeight;
    const scrollHeight = el.scrollHeight;
    if (pageHeight > 0) {
      setTotalPages(Math.max(1, Math.ceil(scrollHeight / pageHeight)));
    }
  }, [settings.scrollMode, settings.fontSize, settings.lineHeight, chapters]);

  const goToPage = (page: number) => {
    if (!contentRef.current) return;
    const clamped = Math.max(0, Math.min(page, totalPages - 1));
    setCurrentPage(clamped);
    const pageHeight = contentRef.current.clientHeight;
    contentRef.current.scrollTop = clamped * pageHeight;
    const pct = totalPages > 1 ? Math.round((clamped / (totalPages - 1)) * 100) : 0;
    setPercentage(pct);
  };

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
  }, [settings.scrollMode, currentPage, totalPages]);

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
          onHighlightClick={(hl: Highlight) => scrollToChapter(hl.chapterNumber)}
          onNoteClick={(n: ReaderNote) => scrollToChapter(n.chapterNumber)}
          onDeleteBookmark={(id: string) => removeBookmark(id)}
          onDeleteHighlight={(id: string) => removeHighlight(id)}
          onDeleteNote={(id: string) => removeNote(id)}
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
                  {ch.translatedContent.split('\n').map((paragraph, i) =>
                    paragraph.trim() ? <p key={i}>{renderWithHighlights(paragraph, ch.chapter.number)}</p> : null
                  )}
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
          onSave={handleSaveNote}
          onCancel={() => setNoteEditor(null)}
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
      {showTtsPanel && (
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
      {!showTtsPanel && audioChapters.length === 0 && (
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
