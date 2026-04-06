'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import ProtectedRoute from '@/components/ProtectedRoute';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import styles from './settings.module.scss';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface ReaderDefaults {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  theme: string;
}

interface NotificationPrefs {
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  translationCompleted: boolean;
  ttsCompleted: boolean;
  paymentReceipt: boolean;
}

const DEFAULT_READER: ReaderDefaults = {
  fontFamily: 'default',
  fontSize: 18,
  lineHeight: 1.8,
  theme: 'light',
};

const DEFAULT_NOTIF: NotificationPrefs = {
  emailEnabled: true,
  pushEnabled: true,
  inAppEnabled: true,
  translationCompleted: true,
  ttsCompleted: true,
  paymentReceipt: true,
};

export default function SettingsPage() {
  const t = useTranslations('settings');
  const locale = useLocale();

  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIF);
  const [reader, setReader] = useState<ReaderDefaults>(DEFAULT_READER);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { permission, isSubscribed, isSupported, subscribe, unsubscribe } = usePushNotifications();

  // Fetch notification preferences from API
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    fetch(`${API_URL}/api/notifications/preferences`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setNotifPrefs({
            emailEnabled: data.emailEnabled ?? true,
            pushEnabled: data.pushEnabled ?? true,
            inAppEnabled: data.inAppEnabled ?? true,
            translationCompleted: data.translationCompleted ?? true,
            ttsCompleted: data.ttsCompleted ?? true,
            paymentReceipt: data.paymentReceipt ?? true,
          });
        }
      })
      .catch(() => {});
  }, []);

  // Load reader settings from localStorage
  useEffect(() => {
    try {
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
    } catch {}
  }, []);

  // Auto-save reader settings to localStorage
  useEffect(() => {
    localStorage.setItem('reader-settings', JSON.stringify(reader));
  }, [reader]);

  const showSavedBadge = () => {
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
  };

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const updateNotifPref = useCallback(async (update: Partial<NotificationPrefs>) => {
    setNotifPrefs(prev => ({ ...prev, ...update }));
    showSavedBadge();

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
      await fetch(`${API_URL}/api/notifications/preferences`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(update),
      });
    } catch {}
  }, []);

  const handlePushToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
      await updateNotifPref({ pushEnabled: false });
    } else {
      const success = await subscribe();
      if (success) {
        await updateNotifPref({ pushEnabled: true });
      }
    }
  };

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

          {/* Email */}
          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>
              <div className={styles.labelText}>{t('email_notifications')}</div>
              <div className={styles.labelDesc}>{t('email_notifications_desc')}</div>
            </div>
            <button
              className={`${styles.toggle} ${notifPrefs.emailEnabled ? styles.active : ''}`}
              onClick={() => updateNotifPref({ emailEnabled: !notifPrefs.emailEnabled })}
              role="switch"
              aria-checked={notifPrefs.emailEnabled}
            />
          </div>

          {/* Push */}
          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>
              <div className={styles.labelText}>{t('push_notifications')}</div>
              <div className={styles.labelDesc}>
                {!isSupported
                  ? t('push_not_supported')
                  : permission === 'denied'
                    ? t('push_denied')
                    : t('push_notifications_desc')}
              </div>
            </div>
            {isSupported && permission !== 'denied' && (
              <button
                className={`${styles.toggle} ${isSubscribed ? styles.active : ''}`}
                onClick={handlePushToggle}
                role="switch"
                aria-checked={isSubscribed}
              />
            )}
          </div>

          {/* In-App */}
          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>
              <div className={styles.labelText}>{t('in_app_notifications')}</div>
              <div className={styles.labelDesc}>{t('in_app_notifications_desc')}</div>
            </div>
            <button
              className={`${styles.toggle} ${notifPrefs.inAppEnabled ? styles.active : ''}`}
              onClick={() => updateNotifPref({ inAppEnabled: !notifPrefs.inAppEnabled })}
              role="switch"
              aria-checked={notifPrefs.inAppEnabled}
            />
          </div>
        </div>

        {/* Notification Events */}
        <div className={styles.section}>
          <h2>{t('notification_events')}</h2>

          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>
              <div className={styles.labelText}>{t('event_translation')}</div>
            </div>
            <button
              className={`${styles.toggle} ${notifPrefs.translationCompleted ? styles.active : ''}`}
              onClick={() => updateNotifPref({ translationCompleted: !notifPrefs.translationCompleted })}
              role="switch"
              aria-checked={notifPrefs.translationCompleted}
            />
          </div>

          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>
              <div className={styles.labelText}>{t('event_tts')}</div>
            </div>
            <button
              className={`${styles.toggle} ${notifPrefs.ttsCompleted ? styles.active : ''}`}
              onClick={() => updateNotifPref({ ttsCompleted: !notifPrefs.ttsCompleted })}
              role="switch"
              aria-checked={notifPrefs.ttsCompleted}
            />
          </div>

          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>
              <div className={styles.labelText}>{t('event_payment')}</div>
            </div>
            <button
              className={`${styles.toggle} ${notifPrefs.paymentReceipt ? styles.active : ''}`}
              onClick={() => updateNotifPref({ paymentReceipt: !notifPrefs.paymentReceipt })}
              role="switch"
              aria-checked={notifPrefs.paymentReceipt}
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
