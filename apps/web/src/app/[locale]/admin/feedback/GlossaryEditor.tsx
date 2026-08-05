'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import styles from '../admin.module.scss';
import type { AdminFeedback } from './page';

interface Props {
  feedback: AdminFeedback;
  onClose: () => void;
  onSaved: () => void;
}

interface Row {
  term: string;
  ka: string;
  type: string;
  gender: string;
}

const TYPES = ['', 'character', 'place', 'organization', 'term'] as const;

/** Persisted glossaries hold either a bare Georgian string or the rich shape. */
function toRows(glossary: AdminFeedback['translation']['glossary']): Row[] {
  return Object.entries(glossary || {})
    .map(([term, value]) =>
      typeof value === 'string'
        ? { term, ka: value, type: '', gender: '' }
        : { term, ka: value.ka, type: value.type || '', gender: value.gender || '' },
    )
    .sort((a, b) => a.term.localeCompare(b.term));
}

/**
 * Fix the terms a reader complained about. Saving only sends changed rows, so
 * a concurrent glossary update from a running translation isn't clobbered.
 */
export default function GlossaryEditor({ feedback, onClose, onSaved }: Props) {
  const t = useTranslations('admin');
  const initial = useMemo(() => toRows(feedback.translation.glossary), [feedback]);
  const [rows, setRows] = useState<Row[]>(initial);
  const [newRow, setNewRow] = useState<Row>({ term: '', ka: '', type: '', gender: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const changed = rows.filter((row, i) => {
        const before = initial[i];
        return row.ka !== before.ka || row.type !== before.type || row.gender !== before.gender;
      });
      const entries = [...changed, ...(newRow.term.trim() && newRow.ka.trim() ? [newRow] : [])].map(
        (row) => ({
          term: row.term,
          ka: row.ka,
          ...(row.type ? { type: row.type } : {}),
          ...(row.type === 'character' && row.gender ? { gender: row.gender } : {}),
        }),
      );

      if (entries.length === 0) {
        onClose();
        return;
      }

      const res = await apiFetch(`/api/admin/translations/${feedback.translation.id}/glossary`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || (await res.text()));
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('action_failed'));
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <div
        className={styles.glossaryModal}
        role="dialog"
        aria-modal="true"
        aria-label={t('glossary_title')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3>{t('glossary_title')}</h3>
        <p className={styles.statSubvalue}>{feedback.translation.book.title}</p>

        <blockquote className={styles.reportedText}>{feedback.selectedText}</blockquote>
        {feedback.comment && <p className={styles.reportComment}>“{feedback.comment}”</p>}

        <p className={styles.statSubvalue}>{t('glossary_hint')}</p>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>{t('glossary_term')}</th>
                <th className={styles.th}>{t('glossary_ka')}</th>
                <th className={styles.th}>{t('glossary_type')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.term} className={styles.tr}>
                  <td className={styles.td}>{row.term}</td>
                  <td className={styles.td}>
                    <input
                      className={styles.searchInput}
                      value={row.ka}
                      onChange={(e) => update(index, { ka: e.target.value })}
                      placeholder={t('glossary_blank_removes')}
                    />
                  </td>
                  <td className={styles.td}>
                    <select
                      className={styles.filterSelect}
                      value={row.type}
                      onChange={(e) => update(index, { type: e.target.value })}
                    >
                      {TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type || '—'}
                        </option>
                      ))}
                    </select>
                    {row.type === 'character' && (
                      <select
                        className={styles.filterSelect}
                        value={row.gender}
                        onChange={(e) => update(index, { gender: e.target.value })}
                      >
                        <option value="">—</option>
                        <option value="male">male</option>
                        <option value="female">female</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
              <tr className={styles.tr}>
                <td className={styles.td}>
                  <input
                    className={styles.searchInput}
                    value={newRow.term}
                    onChange={(e) => setNewRow({ ...newRow, term: e.target.value })}
                    placeholder={t('glossary_new_term')}
                  />
                </td>
                <td className={styles.td}>
                  <input
                    className={styles.searchInput}
                    value={newRow.ka}
                    onChange={(e) => setNewRow({ ...newRow, ka: e.target.value })}
                    placeholder={t('glossary_new_ka')}
                  />
                </td>
                <td className={styles.td}>
                  <select
                    className={styles.filterSelect}
                    value={newRow.type}
                    onChange={(e) => setNewRow({ ...newRow, type: e.target.value })}
                  >
                    {TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type || '—'}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.reportActions}>
          <button type="button" className={styles.actionBtn} onClick={onClose} disabled={saving}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? t('loading') : t('glossary_save')}
          </button>
        </div>
      </div>
    </div>
  );
}
