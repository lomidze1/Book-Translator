import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';

export type Locale = 'ka' | 'en';

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LOCALE_KEY = 'app_locale';
const SUPPORTED_LOCALES: Locale[] = ['ka', 'en'];

const LocaleContext = createContext<LocaleContextType | null>(null);

function getDeviceLocale(): Locale {
  const deviceLocales = getLocales();
  const deviceLang = deviceLocales[0]?.languageCode ?? '';
  if (SUPPORTED_LOCALES.includes(deviceLang as Locale)) {
    return deviceLang as Locale;
  }
  return 'ka';
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getDeviceLocale());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_KEY).then((saved) => {
      if (saved && SUPPORTED_LOCALES.includes(saved as Locale)) {
        setLocaleState(saved as Locale);
      }
      setLoaded(true);
    });
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    AsyncStorage.setItem(LOCALE_KEY, newLocale);
  }, []);

  if (!loaded) return null;

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextType {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
