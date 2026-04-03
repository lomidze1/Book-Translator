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
import styles from './reader.module.scss';

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
  const { highlights, addHighlight, removeHighlight } = useHighlights(bookId, token);
  const { notes, addNote, removeNote } = useNotes(bookId, token);

  // Local UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeChapter, setActiveChapter] = useState(1);
  const [percentage, setPercentage] = useState(0);
  const [selectionPopup, setSelectionPopup] = useState<{ x: number; y: number; text: string; chapterNumber: number; start: number; end: number } | null>(null);
  const [noteEditor, setNoteEditor] = useState<{ chapterNumber: number; highlightId?: string } | null>(null);

  const chapters = [...translation.translatedChapters].sort(
    (a, b) => a.chapter.number - b.chapter.number
  );

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
          className={styles.contentArea}
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
                    paragraph.trim() ? <p key={i}>{paragraph}</p> : null
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

      {/* Progress Bar */}
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${percentage}%` }} />
      </div>
      <div className={styles.progressLabel}>
        {t('progress', { percentage })}
      </div>
    </div>
  );
}
