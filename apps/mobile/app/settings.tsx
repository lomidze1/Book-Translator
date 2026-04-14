import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';
import { useToast } from '@/context/ToastContext';
import { apiRequest } from '@/services/api';

const READER_SETTINGS_KEY = 'reader-settings';

interface NotificationPrefs {
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  translationCompleted: boolean;
  ttsCompleted: boolean;
  paymentReceipt: boolean;
}

interface ReaderDefaults {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  theme: string;
}

const FONT_FAMILIES = ['default', 'serif', 'sans-serif', 'bpg'];

export default function SettingsScreen() {
  const { theme } = useTheme();
  const { t, locale, setLocale } = useTranslation();
  const { showToast } = useToast();

  // Notification prefs
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    emailEnabled: true, pushEnabled: true, inAppEnabled: true,
    translationCompleted: true, ttsCompleted: true, paymentReceipt: true,
  });
  const [notifLoaded, setNotifLoaded] = useState(false);

  // Reader defaults
  const [readerSettings, setReaderSettings] = useState<ReaderDefaults>({
    fontFamily: 'default', fontSize: 18, lineHeight: 1.8, theme: 'light',
  });

  const [saved, setSaved] = useState(false);

  // Load notification prefs
  useEffect(() => {
    apiRequest<NotificationPrefs>('/notifications/preferences')
      .then((data) => { setNotifPrefs(data); setNotifLoaded(true); })
      .catch(() => setNotifLoaded(true));
  }, []);

  // Load reader settings
  useEffect(() => {
    AsyncStorage.getItem(READER_SETTINGS_KEY).then((raw) => {
      if (raw) {
        try { setReaderSettings(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  const showSavedBadge = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);

  const updateNotifPref = useCallback(async (key: keyof NotificationPrefs, value: boolean) => {
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    try {
      await apiRequest('/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
      });
      showSavedBadge();
    } catch {
      // Revert on failure
      setNotifPrefs(notifPrefs);
      showToast(t('common.error'), 'error');
    }
  }, [notifPrefs, showSavedBadge, showToast, t]);

  const updateReaderSetting = useCallback(<K extends keyof ReaderDefaults>(key: K, value: ReaderDefaults[K]) => {
    const updated = { ...readerSettings, [key]: value };
    setReaderSettings(updated);
    AsyncStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(updated));
    showSavedBadge();
  }, [readerSettings, showSavedBadge]);

  const notifRows: { key: keyof NotificationPrefs; label: string }[] = [
    { key: 'emailEnabled', label: t('settings.email_notifications') },
    { key: 'pushEnabled', label: t('settings.push_notifications') },
    { key: 'inAppEnabled', label: t('settings.in_app_notifications') },
    { key: 'translationCompleted', label: t('settings.event_translation') },
    { key: 'ttsCompleted', label: t('settings.event_tts') },
    { key: 'paymentReceipt', label: t('settings.event_payment') },
  ];

  const readerThemes = [
    { key: 'light', label: t('settings.theme_light') },
    { key: 'sepia', label: t('settings.theme_sepia') },
    { key: 'dark', label: t('settings.theme_dark') },
  ];

  return (
    <ScrollView style={[s.container, { backgroundColor: theme.background }]} contentContainerStyle={s.content}>
      {/* Saved badge */}
      {saved && (
        <View style={[s.savedBadge, { backgroundColor: '#22c55e' }]}>
          <Text style={s.savedText}>{t('settings.saved')}</Text>
        </View>
      )}

      {/* Title */}
      <Text style={[s.pageTitle, { color: theme.text }]}>{t('settings.title')}</Text>

      {/* Notifications */}
      <Text style={[s.sectionTitle, { color: theme.text }]}>{t('settings.notifications')}</Text>
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {notifRows.map((row) => (
          <View key={row.key} style={[s.switchRow, { borderBottomColor: theme.border }]}>
            <Text style={[s.switchLabel, { color: theme.text }]}>{row.label}</Text>
            <Switch
              value={notifPrefs[row.key]}
              onValueChange={(v) => updateNotifPref(row.key, v)}
              trackColor={{ true: theme.primary }}
              disabled={!notifLoaded}
            />
          </View>
        ))}
      </View>

      {/* Reader Defaults */}
      <Text style={[s.sectionTitle, { color: theme.text }]}>{t('settings.reader_defaults')}</Text>
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {/* Font Family */}
        <Text style={[s.settingLabel, { color: theme.textSecondary }]}>{t('settings.font_family')}</Text>
        <View style={s.chipRow}>
          {FONT_FAMILIES.map((f) => (
            <TouchableOpacity
              key={f}
              style={[s.chip, readerSettings.fontFamily === f && { backgroundColor: theme.primary }]}
              onPress={() => updateReaderSetting('fontFamily', f)}
            >
              <Text style={[s.chipText, readerSettings.fontFamily === f && { color: '#fff' }, { color: readerSettings.fontFamily === f ? '#fff' : theme.text }]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Font Size */}
        <View style={s.sliderRow}>
          <Text style={[s.settingLabel, { color: theme.textSecondary }]}>{t('settings.font_size')}</Text>
          <View style={s.stepperRow}>
            <TouchableOpacity
              style={[s.stepBtn, { borderColor: theme.border }]}
              onPress={() => updateReaderSetting('fontSize', Math.max(14, readerSettings.fontSize - 2))}
            >
              <Text style={[s.stepText, { color: theme.primary }]}>A-</Text>
            </TouchableOpacity>
            <Text style={[s.stepValue, { color: theme.text }]}>{readerSettings.fontSize}</Text>
            <TouchableOpacity
              style={[s.stepBtn, { borderColor: theme.border }]}
              onPress={() => updateReaderSetting('fontSize', Math.min(28, readerSettings.fontSize + 2))}
            >
              <Text style={[s.stepText, { color: theme.primary }]}>A+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Line Height */}
        <View style={s.sliderRow}>
          <Text style={[s.settingLabel, { color: theme.textSecondary }]}>{t('settings.line_height')}</Text>
          <View style={s.stepperRow}>
            <TouchableOpacity
              style={[s.stepBtn, { borderColor: theme.border }]}
              onPress={() => updateReaderSetting('lineHeight', Math.max(1.4, +(readerSettings.lineHeight - 0.2).toFixed(1)))}
            >
              <Text style={[s.stepText, { color: theme.primary }]}>-</Text>
            </TouchableOpacity>
            <Text style={[s.stepValue, { color: theme.text }]}>{readerSettings.lineHeight.toFixed(1)}</Text>
            <TouchableOpacity
              style={[s.stepBtn, { borderColor: theme.border }]}
              onPress={() => updateReaderSetting('lineHeight', Math.min(2.2, +(readerSettings.lineHeight + 0.2).toFixed(1)))}
            >
              <Text style={[s.stepText, { color: theme.primary }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Theme */}
        <Text style={[s.settingLabel, { color: theme.textSecondary }]}>{t('settings.reader_theme')}</Text>
        <View style={s.chipRow}>
          {readerThemes.map((rt) => (
            <TouchableOpacity
              key={rt.key}
              style={[s.chip, readerSettings.theme === rt.key && { backgroundColor: theme.primary }]}
              onPress={() => updateReaderSetting('theme', rt.key)}
            >
              <Text style={{ color: readerSettings.theme === rt.key ? '#fff' : theme.text, fontSize: 13, fontWeight: '500' }}>
                {rt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Language */}
      <Text style={[s.sectionTitle, { color: theme.text }]}>{t('settings.language')}</Text>
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[s.settingLabel, { color: theme.textSecondary }]}>{t('settings.language_desc')}</Text>
        <View style={s.chipRow}>
          <TouchableOpacity
            style={[s.chip, locale === 'ka' && { backgroundColor: theme.primary }]}
            onPress={() => { setLocale('ka'); showSavedBadge(); }}
          >
            <Text style={{ color: locale === 'ka' ? '#fff' : theme.text, fontSize: 13, fontWeight: '500' }}>ქართული</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.chip, locale === 'en' && { backgroundColor: theme.primary }]}
            onPress={() => { setLocale('en'); showSavedBadge(); }}
          >
            <Text style={{ color: locale === 'en' ? '#fff' : theme.text, fontSize: 13, fontWeight: '500' }}>English</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 24, fontWeight: '700', marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  card: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8 },
  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1,
  },
  switchLabel: { fontSize: 14, flex: 1 },
  settingLabel: { fontSize: 13, marginBottom: 8, marginTop: 4 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  chipText: { fontSize: 13, fontWeight: '500' },
  sliderRow: { marginBottom: 12 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  stepText: { fontSize: 16, fontWeight: '600' },
  stepValue: { fontSize: 16, fontWeight: '500', width: 40, textAlign: 'center' },
  savedBadge: {
    position: 'absolute', top: 0, right: 16, zIndex: 10,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
  },
  savedText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
