'use client';

import { useTranslations } from 'next-intl';
import { HIGHLIGHT_COLORS, type HighlightColor } from '@book-translator/reader';
import styles from '../reader.module.scss';

interface Props {
  position: { x: number; y: number };
  onHighlight: (color: HighlightColor) => void;
  onAddNote: () => void;
  onCopy: () => void;
  onReport: () => void;
  onClose: () => void;
}

export default function TextSelectionPopup({ position, onHighlight, onAddNote, onCopy, onReport, onClose }: Props) {
  const t = useTranslations('reader');

  return (
    <div
      className={styles.selectionPopup}
      style={{ left: position.x, top: position.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color}
          className={`${styles.colorDot} ${styles[`dot${color.charAt(0).toUpperCase() + color.slice(1)}`]}`}
          onClick={() => { onHighlight(color); onClose(); }}
          title={t(`color_${color}`)}
        />
      ))}
      <button className={styles.selectionBtn} onClick={() => { onAddNote(); onClose(); }}>
        {t('add_note')}
      </button>
      <button className={styles.selectionBtn} onClick={() => { onCopy(); onClose(); }}>
        {t('copy_text')}
      </button>
      <button className={styles.selectionBtn} onClick={() => { onReport(); onClose(); }}>
        {t('report_translation')}
      </button>
    </div>
  );
}
