'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Bookmark, Highlight, ReaderNote } from '@book-translator/reader';
import styles from '../reader.module.scss';

interface Chapter {
  number: number;
  title?: string;
}

interface Props {
  chapters: Chapter[];
  activeChapter: number;
  bookmarks: Bookmark[];
  highlights: Highlight[];
  notes: ReaderNote[];
  open: boolean;
  onChapterClick: (chapterNumber: number) => void;
  onBookmarkClick: (bookmark: Bookmark) => void;
  onHighlightClick: (highlight: Highlight) => void;
  onNoteClick: (note: ReaderNote) => void;
  onDeleteBookmark: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onClose: () => void;
}

type Tab = 'toc' | 'bookmarks' | 'highlights' | 'notes';

export default function ReaderSidebar({
  chapters, activeChapter, bookmarks, highlights, notes,
  open, onChapterClick, onBookmarkClick, onHighlightClick, onNoteClick,
  onDeleteBookmark, onDeleteHighlight, onDeleteNote, onClose,
}: Props) {
  const t = useTranslations('reader');
  const [activeTab, setActiveTab] = useState<Tab>('toc');

  return (
    <>
      {open && <div className={styles.sidebarOverlay} onClick={onClose} />}
      <aside className={`${styles.sidebar} ${!open ? styles.hidden : ''}`}>
        <div className={styles.sidebarTabs}>
          {(['toc', 'bookmarks', 'highlights', 'notes'] as const).map((tab) => (
            <button
              key={tab}
              className={`${styles.sidebarTab} ${activeTab === tab ? styles.active : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {t(tab === 'toc' ? 'contents' : tab)}
            </button>
          ))}
        </div>

        <div className={styles.sidebarContent}>
          {activeTab === 'toc' && (
            <ul className={styles.tocList}>
              {chapters.map((ch) => (
                <li
                  key={ch.number}
                  className={`${styles.tocItem} ${activeChapter === ch.number ? styles.active : ''}`}
                  onClick={() => onChapterClick(ch.number)}
                >
                  {ch.title || t('chapter', { number: ch.number })}
                </li>
              ))}
            </ul>
          )}

          {activeTab === 'bookmarks' && (
            bookmarks.length === 0 ? (
              <div className={styles.emptyState}>{t('no_bookmarks')}</div>
            ) : (
              bookmarks.map((bm) => (
                <div key={bm.id} className={styles.sidebarItem} onClick={() => onBookmarkClick(bm)}>
                  <div className={styles.sidebarItemLabel}>
                    {bm.label || t('chapter', { number: bm.chapterNumber })}
                    <button className={styles.deleteBtn} onClick={(e) => { e.stopPropagation(); onDeleteBookmark(bm.id); }}>
                      &times;
                    </button>
                  </div>
                  <div className={styles.sidebarItemMeta}>
                    {t('chapter', { number: bm.chapterNumber })}
                  </div>
                </div>
              ))
            )
          )}

          {activeTab === 'highlights' && (
            highlights.length === 0 ? (
              <div className={styles.emptyState}>{t('no_highlights')}</div>
            ) : (
              highlights.map((hl) => (
                <div key={hl.id} className={styles.sidebarItem} onClick={() => onHighlightClick(hl)}>
                  <div className={styles.sidebarItemLabel}>
                    <span className={styles[`dot${hl.color.charAt(0).toUpperCase() + hl.color.slice(1)}`]} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', marginRight: 6 }} />
                    {t('chapter', { number: hl.chapterNumber })}
                    <button className={styles.deleteBtn} onClick={(e) => { e.stopPropagation(); onDeleteHighlight(hl.id); }}>
                      &times;
                    </button>
                  </div>
                  <div className={styles.sidebarItemText}>{hl.selectedText}</div>
                </div>
              ))
            )
          )}

          {activeTab === 'notes' && (
            notes.length === 0 ? (
              <div className={styles.emptyState}>{t('no_notes')}</div>
            ) : (
              notes.map((note) => (
                <div key={note.id} className={styles.sidebarItem} onClick={() => onNoteClick(note)}>
                  <div className={styles.sidebarItemLabel}>
                    {t('chapter', { number: note.chapterNumber })}
                    <button className={styles.deleteBtn} onClick={(e) => { e.stopPropagation(); onDeleteNote(note.id); }}>
                      &times;
                    </button>
                  </div>
                  <div className={styles.sidebarItemText}>{note.content}</div>
                </div>
              ))
            )
          )}
        </div>
      </aside>
    </>
  );
}
