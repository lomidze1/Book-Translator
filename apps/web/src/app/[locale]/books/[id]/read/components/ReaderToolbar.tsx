'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { ReaderSettings } from '@book-translator/reader';
import { FONT_SIZE_RANGE, LINE_HEIGHT_RANGE } from '@book-translator/reader';
import styles from '../reader.module.scss';

interface Props {
  title: string;
  settings: ReaderSettings;
  onSettingsChange: (update: Partial<ReaderSettings>) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onBack: () => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
}

export default function ReaderToolbar({
  title, settings, onSettingsChange,
  sidebarOpen, onToggleSidebar, onBack,
  isBookmarked, onToggleBookmark,
}: Props) {
  const t = useTranslations('reader');
  const [showSettings, setShowSettings] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    if (showSettings) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarLeft}>
        <button className={styles.toolbarBtn} onClick={onBack} title={t('back_to_book')}>
          &#8592;
        </button>
        <button
          className={`${styles.toolbarBtn} ${sidebarOpen ? styles.active : ''}`}
          onClick={onToggleSidebar}
          title={t('contents')}
        >
          &#9776;
        </button>
      </div>

      <div className={styles.toolbarCenter}>
        <h1>{title}</h1>
      </div>

      <div className={styles.toolbarRight}>
        <button
          className={`${styles.toolbarBtn} ${isBookmarked ? styles.active : ''}`}
          onClick={onToggleBookmark}
          title={t('bookmark_current')}
        >
          &#9733;
        </button>
        <button
          className={styles.toolbarBtn}
          onClick={() => setShowSettings(!showSettings)}
          title={t('settings')}
        >
          Aa
        </button>
        <button className={styles.toolbarBtn} onClick={toggleFullscreen} title={t('fullscreen')}>
          &#x26F6;
        </button>
      </div>

      {showSettings && (
        <div className={styles.settingsDropdown} ref={dropdownRef}>
          {/* Font Size */}
          <div className={styles.settingRow}>
            <label>{t('font_size')}</label>
            <div className={styles.settingControls}>
              <button
                className={styles.sizeBtn}
                onClick={() => onSettingsChange({ fontSize: settings.fontSize - FONT_SIZE_RANGE.step })}
                disabled={settings.fontSize <= FONT_SIZE_RANGE.min}
              >A-</button>
              <span className={styles.sizeValue}>{settings.fontSize}</span>
              <button
                className={styles.sizeBtn}
                onClick={() => onSettingsChange({ fontSize: settings.fontSize + FONT_SIZE_RANGE.step })}
                disabled={settings.fontSize >= FONT_SIZE_RANGE.max}
              >A+</button>
            </div>
          </div>

          {/* Font Family */}
          <div className={styles.settingRow}>
            <label>{t('font_family')}</label>
            <select
              className={styles.fontSelect}
              value={settings.fontFamily}
              onChange={(e) => onSettingsChange({ fontFamily: e.target.value as ReaderSettings['fontFamily'] })}
            >
              <option value="default">{t('font_default')}</option>
              <option value="serif">{t('font_serif')}</option>
              <option value="sans-serif">{t('font_sans')}</option>
              <option value="bpg">{t('font_bpg')}</option>
            </select>
          </div>

          {/* Line Height */}
          <div className={styles.settingRow}>
            <label>{t('line_height')}</label>
            <div className={styles.settingControls}>
              <button
                className={styles.sizeBtn}
                onClick={() => onSettingsChange({ lineHeight: Math.round((settings.lineHeight - LINE_HEIGHT_RANGE.step) * 10) / 10 })}
                disabled={settings.lineHeight <= LINE_HEIGHT_RANGE.min}
              >-</button>
              <span className={styles.sizeValue}>{settings.lineHeight.toFixed(1)}</span>
              <button
                className={styles.sizeBtn}
                onClick={() => onSettingsChange({ lineHeight: Math.round((settings.lineHeight + LINE_HEIGHT_RANGE.step) * 10) / 10 })}
                disabled={settings.lineHeight >= LINE_HEIGHT_RANGE.max}
              >+</button>
            </div>
          </div>

          {/* Theme */}
          <div className={styles.settingRow}>
            <label>{t('theme')}</label>
            <div className={styles.themeButtons}>
              {(['light', 'sepia', 'dark'] as const).map((theme) => (
                <button
                  key={theme}
                  className={`${styles.themeBtn} ${styles[`theme${theme.charAt(0).toUpperCase() + theme.slice(1)}`]} ${settings.theme === theme ? styles.active : ''}`}
                  onClick={() => onSettingsChange({ theme })}
                  title={t(`theme_${theme}`)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
