'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Bookmark, Highlight, ReaderNote } from '@book-translator/reader';
import styles from '../reader.module.scss';

interface Chapter {
  number: number;
  title?: string;
}

export interface SearchResult {
  chapterNumber: number;
  splitIndex: number;
  snippet: string;
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
  onEditNote: (note: ReaderNote) => void;
  onDeleteBookmark: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onSearch: (query: string) => SearchResult[];
  onSearchResultClick: (result: SearchResult) => void;
  onClose: () => void;
}

type Tab = 'toc' | 'bookmarks' | 'highlights' | 'notes' | 'search';

export default function ReaderSidebar({
  chapters, activeChapter, bookmarks, highlights, notes,
  open, onChapterClick, onBookmarkClick, onHighlightClick, onNoteClick, onEditNote,
  onDeleteBookmark, onDeleteHighlight, onDeleteNote, onSearch, onSearchResultClick, onClose,
}: Props) {
  const t = useTranslations('reader');
  const [activeTab, setActiveTab] = useState<Tab>('toc');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);

  const runSearch = (value: string) => {
    setQuery(value);
    setResults(value.trim().length >= 2 ? onSearch(value) : null);
  };

  return (
    <>
      {open && <div className={styles.sidebarOverlay} onClick={onClose} />}
      <aside className={`${styles.sidebar} ${!open ? styles.hidden : ''}`}>
        <div className={styles.sidebarTabs}>
          {(['toc', 'bookmarks', 'highlights', 'notes', 'search'] as const).map((tab) => (
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
                    <span className={styles.itemActions}>
                      <button
                        className={styles.editBtn}
                        title={t('note_edit')}
                        aria-label={t('note_edit')}
                        onClick={(e) => { e.stopPropagation(); onEditNote(note); }}
                      >
                        &#9998;
                      </button>
                      <button className={styles.deleteBtn} onClick={(e) => { e.stopPropagation(); onDeleteNote(note.id); }}>
                        &times;
                      </button>
                    </span>
                  </div>
                  <div className={styles.sidebarItemText}>{note.content}</div>
                </div>
              ))
            )
          )}

          {activeTab === 'search' && (
            <div className={styles.searchTab}>
              <input
                type="search"
                className={styles.searchInput}
                value={query}
                onChange={(e) => runSearch(e.target.value)}
                placeholder={t('search_placeholder')}
                autoFocus
              />
              {results !== null && (
                results.length === 0 ? (
                  <div className={styles.emptyState}>{t('search_no_results')}</div>
                ) : (
                  <>
                    <div className={styles.sidebarItemMeta}>
                      {t('search_results', { count: results.length })}
                    </div>
                    {results.map((r, i) => (
                      <div
                        key={`${r.chapterNumber}-${r.splitIndex}-${i}`}
                        className={styles.sidebarItem}
                        onClick={() => onSearchResultClick(r)}
                      >
                        <div className={styles.sidebarItemMeta}>
                          {t('chapter', { number: r.chapterNumber })}
                        </div>
                        <div className={styles.sidebarItemText}>{r.snippet}</div>
                      </div>
                    ))}
                  </>
                )
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
