'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import ProtectedRoute from '@/components/ProtectedRoute';
import styles from './settings.module.scss';

interface ReaderDefaults {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  theme: string;
}

const DEFAULT_READER: ReaderDefaults = {
  fontFamily: 'default',
  fontSize: 18,
  lineHeight: 1.8,
  theme: 'light',
};

export default function SettingsPage() {
  const t = useTranslations('settings');
  const locale = useLocale();

  const [emailNotifs, setEmailNotifs] = useState(true);
  const [reader, setReader] = useState<ReaderDefaults>(DEFAULT_READER);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const notifStr = localStorage.getItem('notificationPreferences');
      if (notifStr) {
        const prefs = JSON.parse(notifStr);
        if (typeof prefs.email === 'boolean') setEmailNotifs(prefs.email);
      }

      const readerStr = localStorage.getItem('reader-settings');
      if (readerStr) {
        const parsed = JSON.parse(readerStr);
        setReader({
          fontFamily: ['default', 'serif', 'sans-serif', 'bpg'].includes(parsed.fontFamily) ? parsed.fontFamily : DEFAULT_READER.fontFamily,
          fontSize: typeof parsed.fontSize === 'number' && parsed.fontSize >= 14 && parsed.fontSize <= 28 ? parsed.fontSize : DEFAULT_READER.fontSize,
          lineHeight: typeof parsed.lineHeight === 'number' && parsed.lineHeight >= 1.4 && parsed.lineHeight <= 2.2 ? parsed.lineHeight : DEFAULT_READER.lineHeight,
          theme: ['light', 'sepia', 'dark'].includes(parsed.theme) ? parsed.theme : DEFAULT_READER.theme,
        });
      }
    } catch {
      // Reset to defaults on parse error
    }
  }, []);

  // Auto-save when state changes (fixes stale closure issue)
  useEffect(() => {
    localStorage.setItem('notificationPreferences', JSON.stringify({ email: emailNotifs }));
    localStorage.setItem('reader-settings', JSON.stringify(reader));
  }, [emailNotifs, reader]);

  const showSavedBadge = () => {
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const switchLocale = (newLocale: string) => {
    const currentPath = window.location.pathname;
    const newPath = currentPath.replace(new RegExp(`^/${locale}(?=/|$)`), `/${newLocale}`);
    window.location.href = newPath;
  };

  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <h1 className={styles.title}>
          {t('title')}
          {saved && <span className={styles.savedBadge}>{t('saved')}</span>}
        </h1>

        {/* Notifications */}
        <div className={styles.section}>
          <h2>{t('notifications')}</h2>
          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>
              <div className={styles.labelText}>{t('email_notifications')}</div>
              <div className={styles.labelDesc}>{t('email_notifications_desc')}</div>
            </div>
            <button
              className={`${styles.toggle} ${emailNotifs ? styles.active : ''}`}
              onClick={() => { setEmailNotifs((prev) => !prev); showSavedBadge(); }}
              role="switch"
              aria-checked={emailNotifs}
            />
          </div>
        </div>

        {/* Reader Defaults */}
        <div className={styles.section}>
          <h2>{t('reader_defaults')}</h2>

          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>
              <div className={styles.labelText}>{t('font_family')}</div>
            </div>
            <select
              className={styles.select}
              value={reader.fontFamily}
              onChange={(e) => { setReader((prev) => ({ ...prev, fontFamily: e.target.value })); showSavedBadge(); }}
            >
              <option value="default">Noto Serif</option>
              <option value="serif">Serif</option>
              <option value="sans-serif">Sans-serif</option>
              <option value="bpg">BPG Glaho</option>
            </select>
          </div>

          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>
              <div className={styles.labelText}>{t('font_size')}</div>
            </div>
            <div className={styles.rangeRow}>
              <input
                type="range"
                min={14}
                max={28}
                step={2}
                value={reader.fontSize}
                onChange={(e) => { setReader((prev) => ({ ...prev, fontSize: Number(e.target.value) })); showSavedBadge(); }}
                className={styles.rangeInput}
              />
              <span className={styles.rangeValue}>{reader.fontSize}</span>
            </div>
          </div>

          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>
              <div className={styles.labelText}>{t('line_height')}</div>
            </div>
            <div className={styles.rangeRow}>
              <input
                type="range"
                min={1.4}
                max={2.2}
                step={0.2}
                value={reader.lineHeight}
                onChange={(e) => { setReader((prev) => ({ ...prev, lineHeight: Number(e.target.value) })); showSavedBadge(); }}
                className={styles.rangeInput}
              />
              <span className={styles.rangeValue}>{reader.lineHeight.toFixed(1)}</span>
            </div>
          </div>

          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>
              <div className={styles.labelText}>{t('theme')}</div>
            </div>
            <div className={styles.themeOptions}>
              {(['light', 'sepia', 'dark'] as const).map((th) => (
                <button
                  key={th}
                  className={`${styles.themeOption} ${reader.theme === th ? styles.active : ''}`}
                  onClick={() => { setReader((prev) => ({ ...prev, theme: th })); showSavedBadge(); }}
                >
                  {t(`theme_${th}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Language */}
        <div className={styles.section}>
          <h2>{t('language')}</h2>
          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>
              <div className={styles.labelText}>{t('language_desc')}</div>
            </div>
            <div className={styles.langOptions}>
              <button
                className={`${styles.langOption} ${locale === 'ka' ? styles.active : ''}`}
                onClick={() => switchLocale('ka')}
              >
                ქართული
              </button>
              <button
                className={`${styles.langOption} ${locale === 'en' ? styles.active : ''}`}
                onClick={() => switchLocale('en')}
              >
                English
              </button>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
