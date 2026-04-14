import { useCallback, useEffect } from 'react';
import { useLocale } from '@/context/LocaleContext';
import i18n from './index';

export function useTranslation() {
  const { locale, setLocale } = useLocale();

  useEffect(() => {
    i18n.locale = locale;
  }, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      return i18n.t(key, { defaultValue: key, ...params });
    },
    [locale],
  );

  return { t, locale, setLocale };
}
