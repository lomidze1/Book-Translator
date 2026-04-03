'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import styles from '../reader.module.scss';

interface Props {
  initialContent?: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}

export default function NoteEditor({ initialContent = '', onSave, onCancel }: Props) {
  const t = useTranslations('reader');
  const [content, setContent] = useState(initialContent);

  return (
    <div className={styles.noteEditor}>
      <textarea
        className={styles.noteTextarea}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t('note_placeholder')}
        autoFocus
      />
      <div className={styles.noteActions}>
        <button className={styles.btnSecondary} onClick={onCancel}>
          {t('note_cancel')}
        </button>
        <button
          className={styles.btnPrimary}
          onClick={() => content.trim() && onSave(content.trim())}
          disabled={!content.trim()}
        >
          {t('note_save')}
        </button>
      </div>
    </div>
  );
}
